import { describe, expect, it } from 'vitest';

import {
  analysisLimitations,
  classifyCell,
  observationCriteria,
  observationLabel,
  summarise,
  toObservations,
} from '@/lib/analysis';
import type { CoverageCell } from '@/lib/db/stats';

/**
 * The classification rules are published next to the map, so they are part of
 * the product's contract with the reader. These tests pin them.
 */

function cell(overrides: Partial<CoverageCell> = {}): CoverageCell {
  return {
    cell: '8635:14619',
    centerLatitude: 38.8606,
    centerLongitude: 65.7891,
    binCount: 0,
    verifiedCount: 0,
    openReportCount: 0,
    missingReportCount: 0,
    pendingSubmissionCount: 0,
    ...overrides,
  };
}

describe('classifyCell', () => {
  it('treats a missing-bin report as the overriding signal', () => {
    // Even a well-documented cell is "disputed" once somebody reports a bin
    // gone, because that is the claim most worth investigating.
    expect(classifyCell(cell({ binCount: 9, missingReportCount: 1 }))).toBe('disputed');
  });

  it('calls a cell with no recorded bins undocumented, not empty', () => {
    expect(classifyCell(cell({ pendingSubmissionCount: 2 }))).toBe('undocumented_with_signals');
    expect(classifyCell(cell({ openReportCount: 1 }))).toBe('undocumented_with_signals');
  });

  it('flags repeated open problems where bins do exist', () => {
    expect(classifyCell(cell({ binCount: 4, openReportCount: 2 }))).toBe('reported_problems');
  });

  it('calls three or more quiet bins documented', () => {
    expect(classifyCell(cell({ binCount: 3 }))).toBe('documented');
    expect(classifyCell(cell({ binCount: 3, openReportCount: 1 }))).toBe('documented');
  });

  it('calls one or two bins sparse', () => {
    expect(classifyCell(cell({ binCount: 1 }))).toBe('sparse');
    expect(classifyCell(cell({ binCount: 2, openReportCount: 1 }))).toBe('sparse');
  });

  it('matches the criteria text published beside the map', () => {
    // Each class must have a stated rule and a label; an unexplained class on
    // the legend would be worse than no class at all.
    for (const kind of Object.keys(observationCriteria) as (keyof typeof observationCriteria)[]) {
      expect(observationCriteria[kind].length).toBeGreaterThan(20);
      expect(observationLabel[kind].length).toBeGreaterThan(2);
    }
  });
});

describe('toObservations', () => {
  it('attaches bounds that contain the cell centre', () => {
    const [observation] = toObservations([cell({ binCount: 1 })]);
    expect(observation?.bounds).not.toBeNull();
    expect(observation!.centerLatitude).toBeGreaterThan(observation!.bounds!.minLat);
    expect(observation!.centerLatitude).toBeLessThan(observation!.bounds!.maxLat);
  });

  it('carries the raw counts through, so a reader can check the rule', () => {
    const [observation] = toObservations([
      cell({ binCount: 5, verifiedCount: 2, openReportCount: 3, pendingSubmissionCount: 1 }),
    ]);
    expect(observation).toMatchObject({
      binCount: 5,
      verifiedCount: 2,
      openReportCount: 3,
      pendingSubmissionCount: 1,
    });
  });
});

describe('summarise', () => {
  it('reports nothing rather than zero when there is no data', () => {
    const summary = summarise([]);
    expect(summary.cellsWithData).toBe(0);
    expect(summary.totalBins).toBe(0);
    // Not 0 — a share of nothing is undefined, and printing "0%" would be a
    // claim the data does not support.
    expect(summary.verifiedShare).toBeNull();
  });

  it('computes the verified share only from recorded bins', () => {
    const summary = summarise(
      toObservations([
        cell({ cell: '1:1', binCount: 4, verifiedCount: 1 }),
        cell({ cell: '1:2', binCount: 6, verifiedCount: 3 }),
      ]),
    );
    expect(summary.totalBins).toBe(10);
    expect(summary.verifiedBins).toBe(4);
    expect(summary.verifiedShare).toBeCloseTo(0.4, 6);
  });

  it('counts cells per class', () => {
    const summary = summarise(
      toObservations([
        cell({ cell: '1:1', binCount: 5 }),
        cell({ cell: '1:2', binCount: 1 }),
        cell({ cell: '1:3', missingReportCount: 1, binCount: 2 }),
      ]),
    );
    expect(summary.byKind.documented).toBe(1);
    expect(summary.byKind.sparse).toBe(1);
    expect(summary.byKind.disputed).toBe(1);
  });

  it('reports the grid size in metres', () => {
    expect(summarise([]).gridSizeMeters).toBeGreaterThan(400);
    expect(summarise([]).gridSizeMeters).toBeLessThan(600);
  });
});

describe('published limitations', () => {
  it('states the inferences the data cannot support', () => {
    expect(analysisLimitations.length).toBeGreaterThanOrEqual(5);
    const all = analysisLimitations.join(' ');
    // The two readings that would most mislead a reader.
    expect(all).toContain('quti yo‘q degani emas');
    expect(all).toContain('muammo yo‘qligini bildirmaydi');
  });
});
