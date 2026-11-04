import { describe, expect, it } from 'vitest';
import { decodeTypedSseEvent, parseSseRecords } from '../sse';

describe('parseSseRecords', () => {
  it('parses a single data-only record', () => {
    const records = parseSseRecords('data: hello\n\n');
    expect(records).toEqual([{ data: 'hello' }]);
  });

  it('joins consecutive data lines into one record', () => {
    const records = parseSseRecords('data: line1\ndata: line2\n\n');
    expect(records).toEqual([{ data: 'line1\nline2' }]);
  });

  it('parses event + id + data fields', () => {
    const records = parseSseRecords(
      'event: session.status\nid: 12\ndata: {"type":"session.status"}\n\n',
    );
    expect(records).toEqual([
      { event: 'session.status', id: '12', data: '{"type":"session.status"}' },
    ]);
  });

  it('splits multiple events on blank lines', () => {
    const records = parseSseRecords('id: 1\ndata: first\n\nid: 2\ndata: second\n\n');
    expect(records).toEqual([
      { id: '1', data: 'first' },
      { id: '2', data: 'second' },
    ]);
  });

  it('ignores comment lines and unknown fields', () => {
    const records = parseSseRecords(': heartbeat\nretry: 3000\ndata: value\n\n');
    expect(records).toEqual([{ data: 'value' }]);
  });

  it('handles a trailing record without a terminating blank line', () => {
    const records = parseSseRecords('data: tail');
    expect(records).toEqual([{ data: 'tail' }]);
  });

  it('normalizes CRLF line endings', () => {
    const records = parseSseRecords('data: a\r\n\r\ndata: b\r\n\r\n');
    expect(records).toEqual([{ data: 'a' }, { data: 'b' }]);
  });

  it('strips a single leading space after the colon', () => {
    const records = parseSseRecords('data: spaced\n\n');
    expect(records).toEqual([{ data: 'spaced' }]);
  });
});

describe('decodeTypedSseEvent', () => {
  it('returns the payload when the type matches', () => {
    const payload = '{"type":"session.status","sessionID":"s1","status":"busy"}';
    const decoded = decodeTypedSseEvent<{ sessionID: string; status: string }>(
      payload,
      'session.status',
    );
    expect(decoded).toEqual({ type: 'session.status', sessionID: 's1', status: 'busy' });
  });

  it('returns null when the type does not match', () => {
    expect(decodeTypedSseEvent('{"type":"message.created"}', 'session.status')).toBeNull();
  });

  it('returns null for non-JSON data', () => {
    expect(decodeTypedSseEvent('not json', 'session.status')).toBeNull();
  });
});
