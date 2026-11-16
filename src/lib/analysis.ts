import { COVERAGE_GRID_DEG } from '@/lib/config';
import { gridCellBounds, type BoundingBox } from '@/lib/geo';
import type { CoverageCell } from '@/lib/db/stats';

/**
 * Geographical observations from the coverage grid.
 *
 * This module turns per-cell counts into statements about *the data*, never
 * into statements about the city. The distinction matters:
 *
 *   - A cell with no bins in the database means nobody has recorded a bin
 *     there. It does not mean no bin exists there.
 *   - Many reports in a cell means people are reporting problems there. It
 *     does not mean the area needs more bins — it may mean the area is simply
 *     better covered by people who report.
 *   - Few reports means few reports. It does not mean there are no problems.
 *
 * So there is no composite "coverage score". A single number would imply a
 * precision the data does not have, and would invite being read as a municipal
 * planning decision. What we publish instead is a classification with an
 * explicit, stated rule per class, plus the counts the class was derived from,
 * so a reader can disagree with the rule and still use the counts.
 */

export type ObservationKind =
  | 'documented'
  | 'sparse'
  | 'undocumented_with_signals'
  | 'reported_problems'
  | 'disputed';

export interface CellObservation {
  cell: string;
  bounds: BoundingBox | null;
  centerLatitude: number;
  centerLongitude: number;
  kind: ObservationKind;
  binCount: number;
  verifiedCount: number;
  openReportCount: number;
  missingReportCount: number;
  pendingSubmissionCount: number;
}

/** The rule behind each class, shown in the interface next to the legend. */
export const observationCriteria: Record<ObservationKind, string> = {
  documented:
    'Ma’lumotlar bazasida 3 va undan ko‘p tasdiqlangan quti bor, ochiq xabarlar soni 2 dan kam.',
  sparse: 'Ma’lumotlar bazasida 1–2 ta tasdiqlangan quti bor.',
  undocumented_with_signals:
    'Tasdiqlangan quti yo‘q, lekin bu hududda ko‘rib chiqilmagan takliflar yoki xabarlar mavjud.',
  reported_problems: 'Qutilar bor, lekin 2 va undan ko‘p ochiq muammo xabari mavjud.',
  disputed: '«Quti mavjud emas» turidagi xabar kelgan — joyida tekshirish talab qiladi.',
};

export const observationLabel: Record<ObservationKind, string> = {
  documented: 'Hujjatlashtirilgan',
  sparse: 'Kam ma’lumot',
  undocumented_with_signals: 'Ma’lumot yo‘q, signal bor',
  reported_problems: 'Muammo xabarlari ko‘p',
  disputed: 'Tekshirish talab qiladi',
};

export const observationHint: Record<ObservationKind, string> = {
  documented: 'Bu hududda qutilar ro‘yxatga olingan va hozircha ochiq muammo kam.',
  sparse: 'Bu hududda bir-ikkita quti ro‘yxatga olingan. Ko‘proq ma’lumot foydali bo‘ladi.',
  undocumented_with_signals:
    'Bu hudud haqida xabarlar bor, lekin tasdiqlangan quti yo‘q. Bu yerda quti yo‘q degani emas — faqat hali ro‘yxatga olinmagan.',
  reported_problems: 'Bu hududdagi qutilar haqida bir nechta ochiq xabar mavjud.',
  disputed: 'Bu hududdagi quti haqida «mavjud emas» xabari kelgan va u tekshirilmoqda.',
};

export function classifyCell(cell: CoverageCell): ObservationKind {
  if (cell.missingReportCount > 0) return 'disputed';
  if (cell.binCount === 0) return 'undocumented_with_signals';
  if (cell.openReportCount >= 2) return 'reported_problems';
  if (cell.binCount >= 3) return 'documented';
  return 'sparse';
}

export function toObservations(cells: CoverageCell[]): CellObservation[] {
  return cells.map((cell) => ({
    cell: cell.cell,
    bounds: gridCellBounds(cell.cell, COVERAGE_GRID_DEG),
    centerLatitude: cell.centerLatitude,
    centerLongitude: cell.centerLongitude,
    kind: classifyCell(cell),
    binCount: cell.binCount,
    verifiedCount: cell.verifiedCount,
    openReportCount: cell.openReportCount,
    missingReportCount: cell.missingReportCount,
    pendingSubmissionCount: cell.pendingSubmissionCount,
  }));
}

export interface AnalysisSummary {
  cellsWithData: number;
  gridSizeMeters: number;
  totalBins: number;
  verifiedBins: number;
  byKind: Record<ObservationKind, number>;
  /** Share of recorded bins that have been checked on site, 0–1, or null. */
  verifiedShare: number | null;
}

export function summarise(observations: CellObservation[]): AnalysisSummary {
  const byKind: Record<ObservationKind, number> = {
    documented: 0,
    sparse: 0,
    undocumented_with_signals: 0,
    reported_problems: 0,
    disputed: 0,
  };
  let totalBins = 0;
  let verifiedBins = 0;

  for (const o of observations) {
    byKind[o.kind] += 1;
    totalBins += o.binCount;
    verifiedBins += o.verifiedCount;
  }

  return {
    cellsWithData: observations.length,
    // At this latitude a degree of latitude is ~111.3 km.
    gridSizeMeters: Math.round(COVERAGE_GRID_DEG * 111_320),
    totalBins,
    verifiedBins,
    byKind,
    verifiedShare: totalBins > 0 ? verifiedBins / totalBins : null,
  };
}

/**
 * The limitations we publish alongside every analysis view. Not boilerplate:
 * each line corresponds to an inference the data genuinely cannot support.
 */
export const analysisLimitations: string[] = [
  'Ma’lumotlar bazasida qutisi yo‘q hudud — u yerda quti yo‘q degani emas. Bu faqat hali hech kim qo‘shmaganini bildiradi.',
  'Xabarlar soni ko‘p bo‘lishi hududga ko‘proq quti kerakligini avtomatik isbotlamaydi. Bu, aksincha, u yerda faol foydalanuvchilar borligini ham bildirishi mumkin.',
  'Xabarlar soni kam bo‘lishi muammo yo‘qligini bildirmaydi.',
  'Tahlil faqat BinMap bazasidagi ma’lumotlarga tayanadi. U rasmiy infratuzilma ro‘yxati emas.',
  'Bu vosita hududlarni tekshirish uchun savollar tug‘diradi — shahar rejalashtirish qarori emas.',
];
