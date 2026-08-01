import { createWorkerApplication } from './runtime/application-facades.js';

const { workerHandler } = createWorkerApplication();

export default workerHandler;
