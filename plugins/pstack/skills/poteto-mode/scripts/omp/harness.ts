export const ompHarness = {
  id: "omp", nativeProvider: null, configDirectory: ".omp/agent",
  configDirectoryVariable: "PI_CODING_AGENT_DIR", configDirectorySuffix: "",
  projectDirectory: ".omp", integration: "launch",
  integrationFiles: [], launch: "detached", sessionVariable: null,
  identityVariables: ["PSTACK_OMP_PARENT"],
} as const;
