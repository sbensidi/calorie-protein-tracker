import '@testing-library/jest-dom'

// Stub window.matchMedia — not implemented in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Provide a reliable in-memory localStorage for all tests
const _store: Record<string, string> = {}
const localStorageMock: Storage = {
  getItem:    (key)       => _store[key] ?? null,
  setItem:    (key, val)  => { _store[key] = String(val) },
  removeItem: (key)       => { delete _store[key] },
  clear:      ()          => { Object.keys(_store).forEach(k => delete _store[k]) },
  key:        (i)         => Object.keys(_store)[i] ?? null,
  get length()            { return Object.keys(_store).length },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })
