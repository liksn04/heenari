import { describe, expect, it } from 'vitest';
import { selectionSummary, toggleSlot } from './selection';

const s = (id: string) => `2026-09-22_${id}`;

describe('toggleSlot', () => {
  it('빈 선택에서 슬롯을 선택한다', () => {
    expect(toggleSlot([], s('18-00'))).toEqual([s('18-00')]);
  });

  it('위로 인접한 슬롯을 누르면 범위를 넓힌다', () => {
    expect(toggleSlot([s('18-00')], s('18-30'))).toEqual([s('18-00'), s('18-30')]);
    expect(toggleSlot([s('18-00'), s('18-30')], s('19-00'))).toEqual([s('18-00'), s('18-30'), s('19-00')]);
  });

  it('아래로 인접한 슬롯을 누르면 범위를 넓힌다', () => {
    expect(toggleSlot([s('18-30')], s('18-00'))).toEqual([s('18-00'), s('18-30')]);
  });

  it('마지막 슬롯을 다시 누르면 위에서부터 줄인다', () => {
    expect(toggleSlot([s('18-00'), s('18-30')], s('18-30'))).toEqual([s('18-00')]);
  });

  it('첫 슬롯을 다시 누르면 아래에서부터 줄인다', () => {
    expect(toggleSlot([s('18-00'), s('18-30')], s('18-00'))).toEqual([s('18-30')]);
  });

  it('하나뿐인 슬롯을 다시 누르면 선택을 해제한다', () => {
    expect(toggleSlot([s('18-00')], s('18-00'))).toEqual([]);
  });

  it('비연속 슬롯을 누르면 기존 선택을 지우고 새로 시작한다', () => {
    expect(toggleSlot([s('18-00')], s('20-00'))).toEqual([s('20-00')]);
  });

  it('다른 날짜를 누르면 새로 시작한다', () => {
    expect(toggleSlot([s('18-00')], '2026-09-23_09-00')).toEqual(['2026-09-23_09-00']);
  });

  it('8슬롯을 넘기려 하면 확장하지 않고 새 슬롯에서 시작한다', () => {
    const eight = ['18-00', '18-30', '19-00', '19-30', '20-00', '20-30', '21-00', '21-30'].map(s);
    expect(toggleSlot(eight, s('22-00'))).toEqual([s('22-00')]);
  });
});

describe('selectionSummary', () => {
  it('빈 선택은 null이다', () => {
    expect(selectionSummary([])).toBeNull();
  });

  it('시작·종료 라벨과 길이를 계산한다', () => {
    expect(selectionSummary([s('18-00'), s('18-30')])).toEqual({
      startLabel: '18:00',
      endLabel: '19:00',
      count: 2,
      minutes: 60,
    });
  });

  it('마지막 슬롯이 23:30이면 종료를 24:00으로 표기한다', () => {
    expect(selectionSummary([s('23-30')])).toMatchObject({ startLabel: '23:30', endLabel: '24:00' });
  });
});
