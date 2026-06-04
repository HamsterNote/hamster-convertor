// Test to verify backgroundQuality affects actual HTML output
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the html-parser to capture the quality parameter
const mockDecodeToHtml = vi.fn().mockResolvedValue('<html><body>test</body></html>');

vi.mock('@hamster-note/html-parser', () => ({
  HtmlParser: {
    decodeToHtml: mockDecodeToHtml
  }
}));

// Mock pdf-parser
vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: vi.fn().mockResolvedValue({
      outline: undefined,
      pages: [{ width: 595, height: 842 }]
    })
  }
}));

describe('backgroundQuality passing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass backgroundQuality to HtmlParser.decodeToHtml', async () => {
    // Import the converter after mocking
    const { convertPdfToHtml } = await import('../lib/converter');

    // Create a mock PDF buffer
    const mockPdfBuffer = new Uint8Array([1, 2, 3]);

    // Call with high quality
    await convertPdfToHtml(mockPdfBuffer, {
      decodeOptions: {
        background: {
          includeBackground: true,
          backgroundQuality: 1.0,
          excludeTextFromBackground: false
        }
      }
    });

    // Verify the quality was passed
    expect(mockDecodeToHtml).toHaveBeenCalled();
    const callArgs = mockDecodeToHtml.mock.calls[0];
    const options = callArgs[1]; // Second argument is options

    console.log('Options passed to HtmlParser.decodeToHtml:', JSON.stringify(options, null, 2));

    expect(options.background.backgroundQuality).toBe(1.0);
  });

  it('should pass different quality values', async () => {
    const { convertPdfToHtml } = await import('../lib/converter');
    const mockPdfBuffer = new Uint8Array([1, 2, 3]);

    // Test low quality
    await convertPdfToHtml(mockPdfBuffer, {
      decodeOptions: {
        background: { backgroundQuality: 0.3 }
      }
    });

    expect(mockDecodeToHtml).toHaveBeenCalled();
    const lowQualityOptions = mockDecodeToHtml.mock.calls[0][1];
    console.log('Low quality options:', JSON.stringify(lowQualityOptions, null, 2));
    expect(lowQualityOptions.background.backgroundQuality).toBe(0.3);

    // Clear and test high quality
    vi.clearAllMocks();
    mockDecodeToHtml.mockResolvedValue('<html><body>test</body></html>');

    await convertPdfToHtml(mockPdfBuffer, {
      decodeOptions: {
        background: { backgroundQuality: 1.0 }
      }
    });

    expect(mockDecodeToHtml).toHaveBeenCalled();
    const highQualityOptions = mockDecodeToHtml.mock.calls[0][1];
    console.log('High quality options:', JSON.stringify(highQualityOptions, null, 2));
    expect(highQualityOptions.background.backgroundQuality).toBe(1.0);
  });
});
