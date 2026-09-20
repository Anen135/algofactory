import './style.css';
import { GameState } from './state/game-state';
import { Persistence, type StorageAdapter } from './state/storage';
import { createGame } from './renderer/create-game';
import { App } from './ui/app';
let storage: StorageAdapter;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; }
const state = new GameState(new Persistence(storage));
const app = new App(state);
const { scene } = createGame(document.querySelector<HTMLElement>('#game')!, state);
app.attachScene(scene);
