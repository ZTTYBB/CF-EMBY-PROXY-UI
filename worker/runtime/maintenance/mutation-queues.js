export function makeKvMutationQueueRunner(bindingStates) {
  function runDataMutation(mutation, kv = null) {
    if (typeof mutation !== 'function') {
      const binding = mutation;
      return nextMutation => runDataMutation(nextMutation, binding);
    }
    const state = bindingStates.get(kv);
    const task = state.KvDataMutationChain.catch(() => null).then(() => mutation());
    state.KvDataMutationChain = task.catch(() => null);
    return task;
  }

  function runTidyMutation(mutation, kv = null) {
    if (typeof mutation !== 'function') {
      const binding = mutation;
      return nextMutation => runTidyMutation(nextMutation, binding);
    }
    const state = bindingStates.get(kv);
    const task = state.KvTidyMutationChain.catch(() => null).then(() => runDataMutation(mutation, kv));
    state.KvTidyMutationChain = task.catch(() => null);
    return task;
  }

  return Object.freeze({ runDataMutation, runTidyMutation });
}
