#!/usr/bin/env python3
"""Opt-in released-binary tests. Uses only a synthetic localhost provider.
Run: python3 tests/omp-live.py /absolute/path/to/omp
Requires OMP 18.11.3, Bun on PATH, and permission to listen on localhost.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

binary = Path(sys.argv[1]).resolve()
bun = shutil.which('bun')
assert bun, 'Bun must be on PATH'
repo = Path(__file__).resolve().parents[1]
scripts = repo / 'plugins/pstack/skills/poteto-mode/scripts'
requests = []
scenario = ''
results = []

with tempfile.TemporaryDirectory(prefix='pstack-omp-test-') as directory:
    root = Path(directory).resolve()
    agent, work, bins = [root / name for name in ('agent', 'work', 'bin')]
    for path in (agent, work, bins, root / 'config', root / 'tmp'):
        path.mkdir()
    (bins / 'omp').symlink_to(binary)
    (root / 'prompt').write_text('Synthetic probe. Complete the requested operation.')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['content-length'])))
            tools = [item['function']['name'] for item in body.get('tools', [])]
            requests.append({'model': body['model'], 'effort': body.get('reasoning_effort'), 'tools': tools,
                             'skills': all(name in json.dumps(body['messages'])
                                          for name in ('poteto-mode', 'unslop', 'setup-pstack'))})
            if scenario == 'cancel' or (scenario == 'parent-cancel' and 'pstack_task' not in tools):
                time.sleep(3)
                return
            if scenario == 'auth-error':
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error":{"message":"Synthetic authentication error"}}')
                return
            done = any(message.get('role') == 'tool' for message in body['messages'])
            delta, finish = {'role': 'assistant', 'content': 'SYNTHETIC_OK'}, 'stop'
            tool = None
            if not done and scenario in ('outside-write', 'inside-write', 'read-only-write'):
                target = work / 'created.txt' if scenario == 'inside-write' else root / 'outside.txt'
                tool = ('write', {'path': str(target), 'content': 'synthetic'})
            if not done and scenario in ('parent', 'parent-cancel') and 'pstack_task' in tools:
                tool = ('pstack_task', {'role': 'how explorer', 'index': 0, 'prompt': 'Return SYNTHETIC_OK.',
                                        'cwd': str(work), 'mode': 'read-only'})
            if tool:
                delta = {'role': 'assistant', 'tool_calls': [{'index': 0, 'id': 'synthetic-call', 'type': 'function',
                         'function': {'name': tool[0], 'arguments': json.dumps(tool[1])}}]}
                finish = 'tool_calls'
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            for content, reason in [(delta, None), ({}, finish)]:
                frame = {'id': 'synthetic', 'object': 'chat.completion.chunk', 'created': int(time.time()),
                         'model': 'different-server-label', 'choices': [{'index': 0, 'delta': content, 'finish_reason': reason}]}
                if reason:
                    frame['usage'] = {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15}
                self.wfile.write(('data: ' + json.dumps(frame) + '\n\n').encode())
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    model = {'id': 'test-model', 'name': 'Synthetic model', 'reasoning': True, 'input': ['text'],
             'contextWindow': 128000, 'maxTokens': 1024, 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}}
    provider = {'baseUrl': f'http://127.0.0.1:{server.server_port}/v1', 'api': 'openai-completions',
                'apiKey': 'synthetic-local-key', 'models': [model, {**model, 'id': 'plain-model', 'reasoning': False}]}
    (agent / 'models.yml').write_text(json.dumps({'providers': {'pstack-test': provider}}))
    (agent / 'config.yml').write_text(json.dumps({'enabledModels': ['pstack-test/test-model'],
        'disabledProviders': ['claude', 'claude-plugins', 'codex', 'cursor', 'gemini', 'opencode', 'windsurf',
                              'github', 'agents', 'agents-md', 'claude-md', 'mcp-json', 'vscode', 'cline', 'ssh'],
        'telemetry': {'otlpExportEnabled': False}}))
    (agent / 'pstack-models.md').write_text('how explorer: omp:pstack-test/test-model@high\n')
    env = {'PATH': f'{bins}:{Path(bun).parent}:/usr/bin:/bin:/usr/sbin:/sbin',
           'PI_CODING_AGENT_DIR': str(agent), 'PI_CONFIG_DIR': os.path.relpath(root / 'config', Path.home()),
           'TMPDIR': str(root / 'tmp'), 'PI_NO_TITLE': '1', 'OTEL_SDK_DISABLED': 'true', 'PSTACK_OMP_EXECUTABLE': str(binary)}
    try:
        for scenario in ('completion', 'outside-write', 'inside-write', 'read-only-write', 'auth-error',
                         'unsupported-effort', 'missing-model', 'missing-credentials', 'non-reasoning', 'parent', 'cancel', 'parent-cancel', 'missing-guard'):
            requests.clear()
            current_provider = {**provider, 'apiKey': '!false'} if scenario == 'missing-credentials' else provider
            (agent / 'models.yml').write_text(json.dumps({'providers': {'pstack-test': current_provider}}))
            output, receipt = root / f'{scenario}.out', root / f'{scenario}.json'
            selected = 'pstack-test/plain-model' if scenario == 'non-reasoning' else 'pstack-test/test-model'
            if scenario == 'missing-model':
                selected = 'pstack-test/missing'
            effort = 'max' if scenario == 'unsupported-effort' else 'off' if scenario == 'non-reasoning' else 'high'
            argv = [str(scripts / 'runner/pstack-runner'), '--parent', 'omp', '--provider', 'omp',
                    '--model', selected, '--effort', effort, '--mode',
                    'isolated-write' if scenario in ('outside-write', 'inside-write') else 'read-only',
                    '--cwd', str(work), '--prompt', str(root / 'prompt'), '--output', str(output), '--receipt', str(receipt)]
            if scenario in ('parent', 'parent-cancel'):
                argv = [bun, str(scripts / 'pstack-omp'), '--cwd', str(work), '--model', selected,
                        '--effort', effort, '--print', '--prompt', 'Run the configured how explorer worker.']
            if scenario == 'missing-guard':
                argv = [str(binary), '--cwd', str(work), '-p', '--mode', 'json', '--no-extensions', '--pstack-guard-required', '--model', selected, 'Synthetic test']
            proc = subprocess.Popen(argv, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if scenario in ('cancel', 'parent-cancel'):
                stop = time.monotonic() + 15
                minimum = 2 if scenario == 'parent-cancel' else 1
                while len(requests) < minimum and proc.poll() is None and time.monotonic() < stop:
                    time.sleep(.02)
                assert requests, 'Cancellation probe never reached the mock provider'
                proc.terminate()
            try:
                stdout, stderr = proc.communicate(timeout=45)  # Test watchdog only.
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.communicate()
                raise
            if scenario == 'missing-guard':
                assert proc.returncode != 0 and not requests, (stdout, stderr)
            elif scenario == 'parent-cancel':
                stop = time.monotonic() + 5
                receipts = []
                while not receipts and time.monotonic() < stop:
                    for candidate in (root / 'tmp').glob('pstack-omp-*/receipt.json'):
                        try:
                            value = json.loads(candidate.read_text())
                            if value.get('status') == 'cancelled': receipts.append(value)
                        except (ValueError, FileNotFoundError): pass
                    time.sleep(.02)
                assert receipts, ('Parent cancellation did not drain its worker', stdout, stderr)
            elif scenario == 'parent':
                events = [json.loads(line) for line in stdout.splitlines()]
                tools = [event['message'] for event in events if event.get('type') == 'message_end'
                         and event.get('message', {}).get('role') == 'toolResult']
                assert proc.returncode == 0 and len(requests) == 3, (stdout, stderr)
                assert requests[0]['skills'], 'Shared pstack skills were not advertised to the parent'
                assert any(tool.get('toolName') == 'pstack_task' and tool.get('isError') is False for tool in tools), tools
                assert requests[1]['tools'] == ['read', 'grep'], requests
            else:
                result = json.loads(receipt.read_text())
                if scenario in ('unsupported-effort', 'missing-model', 'missing-credentials'):
                    assert proc.returncode != 0 and not requests and not output.exists(), result
                elif scenario == 'auth-error':
                    assert proc.returncode != 0 and not output.exists(), result
                elif scenario == 'cancel':
                    assert result['status'] == 'cancelled' and not output.exists(), result
                else:
                    assert proc.returncode == 0 and result['status'] == 'complete', (result, stderr)
                    assert result['modelEvidence'] == 'pinned-argv' and result['reportedModel'] is None, result
                    assert result['costUsd'] is None and output.read_text() == 'SYNTHETIC_OK', result
                if scenario == 'inside-write':
                    assert (work / 'created.txt').read_text() == 'synthetic'
                assert not (root / 'outside.txt').exists()
            results.append({'scenario': scenario, 'exit': proc.returncode, 'requests': len(requests), 'passed': True})
            print(json.dumps(results[-1]), flush=True)
    finally:
        server.shutdown()
