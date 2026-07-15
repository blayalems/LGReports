import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { configure } from '@testing-library/react';

// IndexedDB-backed screen flows perform several serialized writes before the UI
// reaches its settled state. Keep async assertions tolerant of slower Windows CI
// workers instead of failing at Testing Library's one-second default.
configure({ asyncUtilTimeout: 5_000 });
