import type { WebToolsBridge } from "../shared/ipc/web_tools";

export const mockWebTools: WebToolsBridge = {
  webFetch: async (url, format) => ({
    ok: true,
    data: {
      url,
      status: 200,
      content_type: 'text/html',
      content: '<html><body>Mock fetch result</body></html>',
      truncated: false,
      format: format ?? 'markdown',
      error: null,
    },
  }),
  webSearch: async (query) => ({
    ok: true,
    data: {
      query,
      results: [
        {
          title: 'Mock Result 1',
          url: 'https://example.com/1',
          snippet: 'First mock result',
          score: 0.95,
        },
        {
          title: 'Mock Result 2',
          url: 'https://example.com/2',
          snippet: 'Second mock result',
          score: 0.85,
        },
      ],
      error: null,
    },
  }),
};
