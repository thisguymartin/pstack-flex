# Behavior diff: <PR title or branch>

- Base: `<sha>` (<branch>)
- Head: `<sha>` (<branch>)
- Scenarios: <total> (<identical> identical, <intended> intended, <unintended> unintended)
- Scenario set: `<run-dir>/scenarios.md`
- Normalizer rules: `<run-dir>/normalize.md`

## Unintended differences

| Scenario | Base | Head | Difference | Evidence |
| --- | --- | --- | --- | --- |
| <name> | <value> | <value> | <what changed> | `<run-dir>/<scenario>/` |

## Intended differences

| Scenario | Base | Head | Difference | Claim it matches | Evidence |
| --- | --- | --- | --- | --- | --- |

## Metrics

| Scenario | Method | Base | Head | Ratio |
| --- | --- | --- | --- | --- |
| <name> | <N samples, statistic, interleaved> | <value> | <value> | <head/base, or "no baseline: base lacks the feature"> |

## Identical

<scenario names>

## Dropouts and gaps

<provider, model, receipt path, or "none">
