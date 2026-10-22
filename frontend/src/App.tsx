import React from 'react';
import { Studio } from './features/studio';

/** Studio adapter for isolated rendering. Production main.tsx gates routes with AuthGate. */
export default function App() {
  return <Studio />;
}
