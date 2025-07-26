import * as testModule from './minimal-test.ts';

console.log('Module exports:', Object.keys(testModule));
console.log('testService:', testModule.testService);
console.log('TestService:', testModule.TestService);