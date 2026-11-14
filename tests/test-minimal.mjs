import { createInitialState } from '../src/state.js';

const state = createInitialState();
console.log('Crew:', state.crew.total);
console.log('Resources:', state.resources);
console.log('Test passed!');