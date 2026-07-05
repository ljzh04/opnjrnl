import { describe, it, expect } from 'vitest';
import { toEmbedUrl, detectVideoType } from './ResizableVideo';

describe('toEmbedUrl', () => {
  it('converts youtube.com/watch?v= to embed URL', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts youtu.be/ to embed URL', () => {
    expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts youtube.com/shorts/ to embed URL', () => {
    expect(toEmbedUrl('https://www.youtube.com/shorts/abc123def'))
      .toBe('https://www.youtube.com/embed/abc123def');
  });

  it('converts vimeo.com/ to embed URL', () => {
    expect(toEmbedUrl('https://vimeo.com/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  it('returns original URL for unrecognized patterns', () => {
    expect(toEmbedUrl('https://example.com/video.mp4'))
      .toBe('https://example.com/video.mp4');
  });

  it('handles youtube URLs with extra parameters', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLxyz'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('extracts video ID with underscores and hyphens', () => {
    expect(toEmbedUrl('https://youtu.be/a-b_c1X'))
      .toBe('https://www.youtube.com/embed/a-b_c1X');
  });

  it('returns empty string when given empty string', () => {
    expect(toEmbedUrl('')).toBe('');
  });

  it('returns URL as-is for non-matching URL with video-like path', () => {
    expect(toEmbedUrl('https://mysite.com/videos/123?watch=1'))
      .toBe('https://mysite.com/videos/123?watch=1');
  });

  it('converts mobile youtube URL (matched as substring)', () => {
    expect(toEmbedUrl('https://m.youtube.com/watch?v=abc'))
      .toBe('https://www.youtube.com/embed/abc');
  });

  it('converts shorts URL with extra query params', () => {
    expect(toEmbedUrl('https://www.youtube.com/shorts/abc123?feature=share'))
      .toBe('https://www.youtube.com/embed/abc123');
  });
});

describe('detectVideoType', () => {
  it('detects youtube.com/watch as embed', () => {
    expect(detectVideoType('https://www.youtube.com/watch?v=abc')).toBe('embed');
  });

  it('detects youtu.be as embed', () => {
    expect(detectVideoType('https://youtu.be/abc')).toBe('embed');
  });

  it('detects youtube.com/shorts as embed', () => {
    expect(detectVideoType('https://www.youtube.com/shorts/abc')).toBe('embed');
  });

  it('detects vimeo.com as embed', () => {
    expect(detectVideoType('https://vimeo.com/12345')).toBe('embed');
  });

  it('detects direct video URL as file', () => {
    expect(detectVideoType('https://example.com/video.mp4')).toBe('file');
  });

  it('detects empty string as file', () => {
    expect(detectVideoType('')).toBe('file');
  });
});
