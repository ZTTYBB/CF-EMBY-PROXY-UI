import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';
import { simple as walkSimple } from 'acorn-walk';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const workerRoot = path.join(repositoryRoot, 'worker');
const baselineFile = path.join(scriptDirectory, 'worker-architecture-baseline.json');
const negativeFixtureFile = path.join(repositoryRoot, 'tests', 'fixtures', 'worker-architecture', 'negative-cases.json');
const entryName = 'index.js';
const facadeModuleName = 'runtime/application-facades.js';
const testingHooksName = 'testing/hooks.js';
const defaultModuleMaxLines = 1500;
const facadeRegionMaxLines = 1500;
const facadeSignatures = new Map([
  ['AdminConsoleFacade', ['request', 'env', 'ctx']],
  ['NodeProxyFacade', ['request', 'env', 'ctx', 'routeContext']],
  ['ScheduledMaintenanceFacade', ['event', 'env', 'ctx']]
]);
const requiredFacadeNames = new Set(facadeSignatures.keys());
const nodeBuiltins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const forbiddenIdentifiers = new Map([
  ['operations', 'legacy generic operations bag'],
  ['dataService', 'legacy dataService alias'],
  ['ApiHandlers', 'legacy ApiHandlers bag'],
  ['createActionPorts', 'legacy action capability ports'],
  ['capabilityPorts', 'legacy capability ports'],
  ['compatibilityOperations', 'legacy compatibility operations']
]);
const businessFactoryPattern = /^create(?:Admin|Database|Proxy|Analytics|Schema|Node|Playback|Maintenance|Scheduled|Action|Cache|Logger|Log|D1|DnsWorkflow).*(?:Methods|Actions|Api|Internals|Registry|Service|Services|Shell|Manager|Planner|Executor|Runtime|Schedule|Ports|Workflow|Kernel)$/;

function normalizeName(name) {
  return String(name || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function getFacadeRegionSpans(source) {
  const lines = String(source || '').split(/\r?\n/);
  const spans = [];
  let active = null;
  for (let index = 0; index < lines.length; index += 1) {
    const region = /^\/\/\#region\s+(.+)$/.exec(lines[index]);
    if (region) {
      active = { name: region[1].trim(), line: index + 1 };
      continue;
    }
    if (!/^\/\/\#endregion\b/.test(lines[index]) || !active) continue;
    spans.push({
      name: active.name,
      line: active.line,
      lines: index + 1 - active.line + 1
    });
    active = null;
  }
  return spans;
}

function classify(name) {
  const normalized = normalizeName(name);
  if (normalized === entryName) return { layer: 'entry', slice: '' };
  const [layer, slice = ''] = normalized.split('/');
  return { layer, slice };
}

function classifyProxySlice(name) {
  const [layer, proxy, slice = ''] = normalizeName(name).split('/');
  return layer === 'runtime' && proxy === 'proxy' ? slice : '';
}

function makeError(code, file, message, node = null) {
  return {
    code,
    file: normalizeName(file),
    line: node?.loc?.start?.line || 0,
    column: node?.loc?.start ? node.loc.start.column + 1 : 0,
    message
  };
}

function formatError(error) {
  const location = error.line ? `:${error.line}:${error.column}` : '';
  return `${error.code} ${error.file}${location} ${error.message}`;
}

function classDeclarations(statement) {
  const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  if (declaration?.type === 'ClassDeclaration') {
    return [{ name: declaration.id?.name || '', node: declaration }];
  }
  if (declaration?.type !== 'VariableDeclaration') return [];
  return declaration.declarations
    .filter(item => item.id?.type === 'Identifier' && item.init?.type === 'ClassExpression')
    .map(item => ({ name: item.id.name, node: item.init }));
}

function propertyName(property) {
  if (!property || property.computed) return '';
  if (property.key?.type === 'Identifier' || property.key?.type === 'PrivateIdentifier') return property.key.name;
  return String(property.key?.value ?? '');
}

function memberName(member) {
  if (!member || member.computed) return '';
  if (member.property?.type === 'Identifier' || member.property?.type === 'PrivateIdentifier') return member.property.name;
  return String(member.property?.value ?? '');
}

function resolveRelativeImport(sourceName, specifier) {
  return normalizeName(path.posix.normalize(path.posix.join(path.posix.dirname(sourceName), specifier)));
}

function findCycle(graph) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  function visit(file) {
    if (active.has(file)) return [...stack.slice(stack.indexOf(file)), file];
    if (visited.has(file)) return null;
    visited.add(file);
    active.add(file);
    stack.push(file);
    for (const dependency of graph.get(file) || []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(file);
    return null;
  }
  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}

function handleContainsPrivateCall(handle, name) {
  let found = false;
  walkSimple(handle.value.body, {
    MemberExpression(node) {
      if (node.property?.type === 'PrivateIdentifier' && node.property.name === name) found = true;
    }
  });
  return found;
}

function handleUsesIdentifier(handle, name) {
  let found = false;
  walkSimple(handle.value.body, {
    Identifier(node) {
      if (node.name === name) found = true;
    }
  });
  return found;
}

function handleCallsMember(handle, objectName, expectedMember) {
  let found = false;
  walkSimple(handle.value.body, {
    CallExpression(node) {
      if (
        node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier'
        && node.callee.object.name === objectName
        && memberName(node.callee) === expectedMember
      ) found = true;
    }
  });
  return found;
}

function isSingleCallForwarder(node) {
  if (node?.type !== 'FunctionDeclaration' || node.body.body.length !== 1) return false;
  const statement = node.body.body[0];
  const call = statement.type === 'ReturnStatement'
    ? statement.argument
    : statement.type === 'ExpressionStatement' ? statement.expression : null;
  if (call?.type !== 'CallExpression') return false;
  const directCallee = call.callee?.type === 'Identifier'
    || (call.callee?.type === 'MemberExpression' && call.callee.object?.type === 'Identifier');
  if (!directCallee || call.arguments.length !== node.params.length) return false;
  return call.arguments.every((argument, index) => (
    argument.type === 'Identifier'
    && node.params[index]?.type === 'Identifier'
    && argument.name === node.params[index].name
  ));
}

function unwrapFrozenObject(node) {
  if (node?.type === 'ObjectExpression') return node;
  if (
    node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && node.callee.object?.type === 'Identifier'
    && node.callee.object.name === 'Object'
    && memberName(node.callee) === 'freeze'
  ) {
    return node.arguments[0]?.type === 'ObjectExpression' ? node.arguments[0] : null;
  }
  return null;
}

function validateDependency(sourceName, targetName, node, errors) {
  const source = classify(sourceName);
  const target = classify(targetName);
  const allowedTargets = {
    entry: new Set(['runtime']),
    core: new Set(['core']),
    platform: new Set(['core', 'platform']),
    runtime: new Set(['core', 'platform', 'runtime']),
    testing: new Set(['core', 'platform', 'runtime', 'testing'])
  };
  if (!allowedTargets[source.layer]?.has(target.layer)) {
    errors.push(makeError(
      'REVERSE_DEPENDENCY',
      sourceName,
      `invalid ${source.layer} -> ${target.layer} dependency on ${targetName}`,
      node
    ));
  }
  const sourceSlice = classifyProxySlice(sourceName);
  if (!sourceSlice) return;
  const targetSlice = classifyProxySlice(targetName);
  const allowedProxyTargets = {
    http: new Set(['http']),
    playback: new Set(['http', 'playback'])
  };
  const allowedTarget = target.layer === 'core'
    || (target.layer === 'runtime' && allowedProxyTargets[sourceSlice]?.has(targetSlice));
  if (!allowedTarget) {
    errors.push(makeError(
      'CROSS_SLICE_DEPENDENCY',
      sourceName,
      `${sourceSlice} proxy slice cannot depend on ${targetName}`,
      node
    ));
  }
}

function analyzeFiles(fileSources, { strictRepository = false } = {}) {
  const errors = [];
  const names = [...fileSources.keys()].map(normalizeName).sort();
  const fileSet = new Set(names);
  const graph = new Map(names.map(name => [name, []]));
  const parsed = new Map();
  const resolvedImports = [];
  const facadeNodes = new Map();
  const facadeSpans = new Map();
  let importEdges = 0;

  for (const name of names) {
    const source = fileSources.get(name);
    let ast;
    try {
      ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (error) {
      errors.push(makeError('SYNTAX', name, error.message));
      continue;
    }
    parsed.set(name, ast);
    const layer = classify(name).layer;
    const production = layer !== 'testing';
    const lineCount = source.split(/\r?\n/).length;

    if (production && !['entry', 'runtime', 'core', 'platform'].includes(layer)) {
      errors.push(makeError('UNKNOWN_LAYER', name, 'production modules must use entry/runtime/core/platform boundaries'));
    }
    if (production && name === facadeModuleName) {
      const spans = getFacadeRegionSpans(source);
      if (!spans.length) {
        errors.push(makeError('FACADE_REGIONS', name, 'facade modules must declare bounded //#region blocks'));
      }
      for (const span of spans) {
        if (span.lines > facadeRegionMaxLines) {
          errors.push(makeError('FACADE_REGION_TOO_LARGE', name, `${span.name} exceeds its ${facadeRegionMaxLines}-line budget; found ${span.lines}`, {
            loc: { start: { line: span.line, column: 0 } }
          }));
        }
      }
    } else if (production && name !== entryName && lineCount > defaultModuleMaxLines) {
      errors.push(makeError('MODULE_TOO_LARGE', name, `new production modules may not exceed ${defaultModuleMaxLines} lines; found ${lineCount}`));
    }
    if (production && (name.includes('/public/') || /(?:capabilities|compat-facades)\.js$/.test(name))) {
      errors.push(makeError('LEGACY_MODULE', name, 'legacy capability, compatibility, or public forwarding modules are forbidden'));
    }
    if (production && ast.body.length && ast.body.every(node => (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source
    ))) {
      errors.push(makeError('FORWARDING_MODULE', name, 'pure re-export modules are forbidden'));
    }
    if (production && name !== facadeModuleName) {
      for (const statement of ast.body) {
        const candidate = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
        if (isSingleCallForwarder(candidate)) {
          errors.push(makeError('FORWARDING_MODULE', name, 'single-call technical forwarding functions are forbidden', candidate));
        }
      }
    }

    if (name === facadeModuleName) {
      for (const statement of ast.body) {
        for (const facade of classDeclarations(statement)) {
          if (!requiredFacadeNames.has(facade.name)) continue;
          facadeNodes.set(facade.name, facade.node);
          const span = facade.node.loc.end.line - facade.node.loc.start.line + 1;
          facadeSpans.set(facade.name, span);
          const constructor = facade.node.body.body.find(member => member.type === 'MethodDefinition' && member.kind === 'constructor');
          if (!constructor || constructor.value.params.length !== 1 || constructor.value.params[0].type !== 'ObjectPattern') {
            errors.push(makeError('FACADE_INJECTION', name, `${facade.name} requires one object-pattern constructor`, facade.node));
          }
          const publicMethods = facade.node.body.body.filter(member => (
            member.type === 'MethodDefinition'
            && member.kind === 'method'
            && member.key?.type !== 'PrivateIdentifier'
          ));
          if (publicMethods.length !== 1 || propertyName(publicMethods[0]) !== 'handle') {
            errors.push(makeError('FACADE_SURFACE', name, `${facade.name} may expose only handle()`, facade.node));
          }
          const handle = publicMethods.find(member => propertyName(member) === 'handle');
          if (!handle) continue;
          const actualParams = handle.value.params.map(parameter => parameter.type === 'Identifier' ? parameter.name : '');
          if (actualParams.join(',') !== facadeSignatures.get(facade.name).join(',')) {
            errors.push(makeError('FACADE_SIGNATURE', name, `${facade.name}.handle has an invalid signature`, handle));
          }
          const handleSpan = handle.loc.end.line - handle.loc.start.line + 1;
          if (handleSpan < 5 || handle.value.body.body.length < 2) {
            errors.push(makeError('FACADE_FORWARDING', name, `${facade.name}.handle is a technical forwarding wrapper`, handle));
          }
          if (facade.name === 'AdminConsoleFacade' && !handleContainsPrivateCall(handle, 'verifyRequest')) {
            errors.push(makeError('FACADE_AUTH', name, 'AdminConsoleFacade.handle must own authentication', handle));
          }
          if (facade.name === 'NodeProxyFacade' && !handleUsesIdentifier(handle, 'routeContext')) {
            errors.push(makeError('FACADE_ROUTE_CONTEXT', name, 'NodeProxyFacade.handle must consume routeContext', handle));
          }
          if (facade.name === 'ScheduledMaintenanceFacade' && !handleCallsMember(handle, 'ctx', 'waitUntil')) {
            errors.push(makeError('FACADE_WAIT_UNTIL', name, 'ScheduledMaintenanceFacade.handle must own ctx.waitUntil()', handle));
          }
        }
      }
    }

    const imports = ast.body.filter(node => (
      node.type === 'ImportDeclaration'
      || ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source)
    ));
    for (const node of imports) {
      importEdges += 1;
      const specifier = String(node.source.value || '');
      if (nodeBuiltins.has(specifier) || specifier.startsWith('node:') || !specifier.startsWith('.')) {
        errors.push(makeError('INVALID_IMPORT', name, `Worker imports must be relative ESM paths: ${specifier}`, node));
        continue;
      }
      if (!specifier.endsWith('.js')) {
        errors.push(makeError('INVALID_IMPORT', name, `relative imports require .js: ${specifier}`, node));
        continue;
      }
      const target = resolveRelativeImport(name, specifier);
      if (!fileSet.has(target)) {
        errors.push(makeError('MISSING_IMPORT', name, `import does not resolve: ${specifier}`, node));
        continue;
      }
      graph.get(name).push(target);
      resolvedImports.push({
        source: name,
        target,
        bindings: node.type === 'ImportDeclaration' ? node.specifiers.map(item => ({
          kind: item.type,
          local: item.local?.name || '',
          imported: item.type === 'ImportSpecifier' ? item.imported.name : ''
        })) : []
      });
      if (production && classify(target).layer === 'testing') {
        errors.push(makeError('TESTING_DEPENDENCY', name, `production cannot import ${target}`, node));
      }
      validateDependency(name, target, node, errors);
    }

    for (const statement of ast.body) {
      if (statement.type === 'ExportDefaultDeclaration' && name !== entryName) {
        errors.push(makeError('DEFAULT_EXPORT', name, 'default exports are reserved for worker/index.js', statement));
      }
      if (name === entryName && (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration')) {
        errors.push(makeError('ENTRY_EXPORT', name, 'worker/index.js may expose only the default handler', statement));
      }
    }

    walkSimple(ast, {
      ImportExpression(node) {
        if (production) errors.push(makeError('DYNAMIC_IMPORT', name, 'dynamic import() is forbidden', node));
      },
      CallExpression(node) {
        if (
          production
          && node.callee?.type === 'MemberExpression'
          && node.callee.object?.type === 'Identifier'
          && node.callee.object.name === 'Object'
          && memberName(node.callee) === 'assign'
        ) errors.push(makeError('LATE_BINDING', name, 'Object.assign late binding is forbidden', node));
      },
      FunctionDeclaration(node) {
        if (production && businessFactoryPattern.test(node.id?.name || '')) {
          errors.push(makeError('BUSINESS_FACTORY', name, `business factory ${node.id.name} is forbidden`, node));
        }
      },
      Identifier(node) {
        if (production && forbiddenIdentifiers.has(node.name)) {
          errors.push(makeError('LEGACY_REFERENCE', name, forbiddenIdentifiers.get(node.name), node));
        }
      },
      VariableDeclarator(node) {
        if (production && node.id?.type === 'Identifier' && forbiddenIdentifiers.has(node.id.name)) {
          errors.push(makeError('LEGACY_REFERENCE', name, forbiddenIdentifiers.get(node.id.name), node));
        }
      },
      ObjectExpression(node) {
        if (!production) return;
        const keys = new Set();
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.computed) continue;
          const key = propertyName(property);
          if (forbiddenIdentifiers.has(key)) {
            errors.push(makeError('LEGACY_REFERENCE', name, forbiddenIdentifiers.get(key), property));
          }
          if (keys.has(key)) errors.push(makeError('DUPLICATE_KEY', name, `duplicate object key ${key}`, property));
          keys.add(key);
        }
      }
    });
  }

  if (strictRepository) {
    for (const required of [entryName, facadeModuleName, testingHooksName]) {
      if (!fileSet.has(required)) errors.push(makeError('MISSING_ROOT', required, 'required Worker source file is missing'));
    }
    for (const facadeName of requiredFacadeNames) {
      if (!facadeNodes.has(facadeName)) errors.push(makeError('MISSING_FACADE', facadeModuleName, `${facadeName} is missing`));
    }
    const testingSource = fileSources.get(testingHooksName) || '';
    const applicationCalls = (testingSource.match(/\bcreateWorkerApplication\s*\(/g) || []).length;
    if (applicationCalls !== 1) {
      errors.push(makeError('TEST_APPLICATION', testingHooksName, `test hooks must call createWorkerApplication() once; found ${applicationCalls}`));
    }
    for (const partition of ['kv', 'd1', 'cache', 'fetch', 'clock']) {
      if (!new RegExp(`\\b${partition}\\s*:`).test(testingSource)) {
        errors.push(makeError('TEST_PLATFORM', testingHooksName, `testPlatform is missing ${partition} partition`));
      }
    }
    const testingAst = parsed.get(testingHooksName);
    const createTestApplicationNode = testingAst?.body
      .map(statement => statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement)
      .find(statement => statement?.type === 'FunctionDeclaration' && statement.id?.name === 'createTestApplication');
    let returnedSurface = null;
    if (createTestApplicationNode) {
      walkSimple(createTestApplicationNode.body, {
        ReturnStatement(node) {
          const returnedObject = unwrapFrozenObject(node.argument);
          if (!returnedObject) return;
          returnedSurface = returnedObject.properties
            .filter(property => property.type === 'Property' && !property.computed)
            .map(propertyName)
            .sort();
        }
      });
    }
    const expectedTestingSurface = [
      'adminConsole',
      'nodeProxy',
      'scheduledMaintenance',
      'testPlatform',
      'workerHandler'
    ].sort();
    if (!returnedSurface || returnedSurface.join(',') !== expectedTestingSurface.join(',')) {
      errors.push(makeError(
        'TEST_SURFACE',
        testingHooksName,
        `test hooks must return only ${expectedTestingSurface.join(', ')}`,
        createTestApplicationNode
      ));
    }
  }

  const cycle = findCycle(graph);
  if (cycle) errors.push(makeError('CYCLE', cycle[0], cycle.join(' -> ')));

  const productionNames = names.filter(name => classify(name).layer !== 'testing');

  const productionImportEdges = resolvedImports.filter(item => (
    classify(item.source).layer !== 'testing' && classify(item.target).layer !== 'testing'
  )).length;
  return {
    errors,
    stats: {
      sourceModules: names.length,
      sourceImportEdges: importEdges,
      productionModules: productionNames.length,
      productionImportEdges,
      facadeSpans: Object.fromEntries([...facadeSpans].sort())
    }
  };
}

async function readWorkerSources() {
  const result = new Map();
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        result.set(normalizeName(path.relative(workerRoot, absolute)), await fs.readFile(absolute, 'utf8'));
      }
    }
  }
  await visit(workerRoot);
  return result;
}

function buildFixtureFiles(testCase) {
  const files = new Map();
  for (const [name, descriptor] of Object.entries(testCase.files)) {
    const source = typeof descriptor === 'string' ? descriptor : descriptor.source;
    const padLines = typeof descriptor === 'string' ? 0 : Number(descriptor.padLines) || 0;
    files.set(normalizeName(name), source + '\n// fixture padding'.repeat(Math.max(0, padLines)));
  }
  return files;
}

async function runArchitectureFixtures() {
  const fixture = JSON.parse(await fs.readFile(negativeFixtureFile, 'utf8'));
  for (const testCase of fixture.validCases || []) {
    const result = analyzeFiles(buildFixtureFiles(testCase));
    if (result.errors.length) {
      throw new Error(`valid fixture ${testCase.name} failed with ${result.errors.map(error => error.code).join(', ')}`);
    }
  }
  for (const testCase of fixture.invalidCases || []) {
    const result = analyzeFiles(buildFixtureFiles(testCase));
    const actualCodes = new Set(result.errors.map(error => error.code));
    for (const expectedCode of testCase.expectedCodes) {
      if (!actualCodes.has(expectedCode)) {
        throw new Error(`invalid fixture ${testCase.name} did not fail with ${expectedCode}; got ${[...actualCodes].join(', ')}`);
      }
    }
  }
  return {
    valid: (fixture.validCases || []).length,
    invalid: (fixture.invalidCases || []).length
  };
}

const [fileSources, baseline, fixtureCount] = await Promise.all([
  readWorkerSources(),
  fs.readFile(baselineFile, 'utf8').then(JSON.parse),
  runArchitectureFixtures()
]);
const result = analyzeFiles(fileSources, {
  strictRepository: true
});
if (result.errors.length) {
  console.error('[check-worker-architecture] failed');
  for (const error of result.errors) console.error(`- ${formatError(error)}`);
  process.exit(1);
}

const spans = Object.entries(result.stats.facadeSpans).map(([name, lines]) => `${name}=${lines}`).join(', ');
console.log(
  `[check-worker-architecture] production graph ${baseline.productionGraph.modules} modules/${baseline.productionGraph.importEdges} edges -> `
  + `${result.stats.productionModules} modules/${result.stats.productionImportEdges} edges; `
  + `source graph ${result.stats.sourceModules} modules/${result.stats.sourceImportEdges} edges; `
  + `Facade spans ${spans}; facade regions <= ${facadeRegionMaxLines} lines; `
  + `${fixtureCount.valid} valid/${fixtureCount.invalid} invalid fixtures passed`
);
