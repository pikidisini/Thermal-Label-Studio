// Setup minimal browser DOM mocks before any module importing fabric executes

class MockDocument {
  constructor() {
    this.documentElement = { style: {} };
  }
  createElement() {
    return { getContext: () => ({}), style: {} };
  }
}

if (typeof global.Document === 'undefined') {
  global.Document = MockDocument;
  global.document = new MockDocument();
}

if (typeof global.window === 'undefined') {
  global.window = {
    location: { search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
  };
}
