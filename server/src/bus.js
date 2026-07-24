import { EventEmitter } from 'node:events';

/**
 * Tiny in-process event bus so the REST layer can hand a freshly-persisted
 * follow-up message to the WebSocket relay for live fan-out, without the two
 * modules importing each other. `routes.js` emits `followup:message`, the relay
 * in `followup.js` subscribes and pushes it to the other participant.
 */
export const bus = new EventEmitter();
// A single busy thread can have many listeners across sockets; lift the cap.
bus.setMaxListeners(0);
