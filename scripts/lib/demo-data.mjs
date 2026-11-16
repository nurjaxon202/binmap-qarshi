/**
 * Fictional demonstration locations for Qarshi, Qashqadaryo.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE NOT REAL PUBLIC BINS.
 *
 * Every coordinate below is invented. They sit inside Qarshi's urban area
 * (roughly 38.848–38.876 N, 65.773–65.809 E) and are spaced tens to hundreds
 * of metres apart so the map behaves like a real one — clustering, distances
 * and nearby search all exercise realistic geometry.
 *
 * Descriptions name a *kind* of place ("next to a bus stop", "at a market
 * entrance") and never a real street or building. Naming a real address would
 * amount to asserting that a verified bin exists there, which would be false.
 * Every row is written with is_demo = true and is labelled in the interface.
 * ---------------------------------------------------------------------------
 */

export const QARSHI_DEMO_BINS = [
  // Central area — denser, as a city centre would be.
  { lat: 38.8612, lng: 65.7887, description: 'Markaziy bozor kirish qismida', verification: 'verified', photo: true },
  { lat: 38.86045, lng: 65.7902, description: 'Avtobus bekati yonida', verification: 'verified', photo: true },
  { lat: 38.8598, lng: 65.7876, description: 'Piyodalar yo‘lkasi burchagida', verification: 'community', photo: false },
  { lat: 38.8621, lng: 65.7915, description: 'Kafe oldidagi maydoncha', verification: 'community', photo: true },
  { lat: 38.8589, lng: 65.7908, description: 'Bank filiali yonidagi yo‘lka', verification: 'verified', photo: false },
  { lat: 38.8633, lng: 65.7868, description: 'Maktab darvozasi yaqinida', verification: 'verified', photo: true },
  { lat: 38.8579, lng: 65.7865, description: 'Turar-joy hovlisi kirish qismi', verification: 'community', photo: false },
  { lat: 38.8645, lng: 65.7932, description: 'Park kirish eshigi oldida', verification: 'verified', photo: true },
  { lat: 38.8568, lng: 65.7926, description: 'Poliklinika yonidagi yo‘lka', verification: 'community', photo: true },
  { lat: 38.8659, lng: 65.7852, description: 'Do‘kon oldidagi to‘xtash joyi', verification: 'community', photo: false },

  // Middle ring.
  { lat: 38.8556, lng: 65.7848, description: 'Masjid yonidagi maydoncha', verification: 'community', photo: true },
  { lat: 38.8672, lng: 65.7948, description: 'Sport maydonchasi kirish qismi', verification: 'verified', photo: true },
  { lat: 38.8543, lng: 65.7945, description: 'Bekat pavilyoni yonida', verification: 'community', photo: false },
  { lat: 38.8688, lng: 65.7833, description: 'Oliy ta’lim binosi yaqinida', verification: 'verified', photo: true },
  { lat: 38.8527, lng: 65.7829, description: 'Bozorcha chetidagi yo‘lka', verification: 'community', photo: false },
  { lat: 38.8705, lng: 65.7968, description: 'Turar-joy massivi hovlisida', verification: 'community', photo: true },
  { lat: 38.851, lng: 65.7965, description: 'Chorraha yonidagi yo‘lka', verification: 'community', photo: false },
  { lat: 38.8615, lng: 65.802, description: 'Bog‘ yo‘lkasi yonida', verification: 'community', photo: true },
  { lat: 38.8592, lng: 65.776, description: 'Ko‘cha burchagidagi bekat', verification: 'community', photo: false },
  { lat: 38.8641, lng: 65.7795, description: 'Savdo do‘konlari qatori oldida', verification: 'community', photo: true },

  // Outer ring — sparser, which gives the coverage analysis something to say.
  { lat: 38.8722, lng: 65.7812, description: 'Avtoturargoh chetida', verification: 'community', photo: false },
  { lat: 38.8495, lng: 65.7808, description: 'Bolalar bog‘chasi yonida', verification: 'community', photo: true },
  { lat: 38.874, lng: 65.7988, description: 'Yangi mahalla kirish qismida', verification: 'community', photo: false },
  { lat: 38.848, lng: 65.7987, description: 'Savdo markazi oldidagi maydon', verification: 'verified', photo: true },
  { lat: 38.868, lng: 65.8045, description: 'Stadion yonidagi yo‘lka', verification: 'community', photo: false },
  { lat: 38.855, lng: 65.7735, description: 'Mahalla idorasi yonida', verification: 'community', photo: true },
  { lat: 38.871, lng: 65.807, description: 'Yangi qurilish hududi chetida', verification: 'community', photo: false },
  { lat: 38.852, lng: 65.809, description: 'Temir yo‘l bekati yaqinidagi maydoncha', verification: 'community', photo: true },
];

/**
 * Proposals awaiting a decision, plus ones that were already decided — so the
 * administration queue is not empty and the history is not either.
 *
 * `outcome` drives which real code path the seeder takes:
 *   pending      — left in the queue
 *   under_review — binmap_start_submission_review
 *   approved     — binmap_approve_submission (creates a canonical bin)
 *   rejected     — binmap_reject_submission
 */
export const QARSHI_DEMO_SUBMISSIONS = [
  {
    lat: 38.8604,
    lng: 65.7861,
    description: 'Bekat yonida yangi quti o‘rnatilgan, xaritada yo‘q edi.',
    outcome: 'pending',
    photo: true,
    ageDays: 1,
  },
  {
    lat: 38.8663, lng: 65.7902,
    description: 'Maktab yonidagi yo‘lkada ikkita quti turadi.',
    outcome: 'pending', photo: true, ageDays: 2,
  },
  {
    lat: 38.8536, lng: 65.7881,
    description: 'Hovli kirish qismida quti bor.',
    outcome: 'pending', photo: false, ageDays: 3,
  },
  {
    lat: 38.8699, lng: 65.7876,
    description: 'Avtoturargoh chetidagi quti.',
    outcome: 'pending', photo: true, ageDays: 5,
  },
  {
    lat: 38.8575, lng: 65.7954,
    description: 'Do‘kon oldida yangi quti.',
    outcome: 'under_review', photo: true, ageDays: 6,
  },
  {
    lat: 38.8628, lng: 65.7838,
    description: 'Yo‘lka chetidagi quti — surat ilova qildim.',
    outcome: 'under_review', photo: true, ageDays: 8,
  },
  {
    // Approved: becomes a real (demonstration) bin on the map.
    lat: 38.8585, lng: 65.7838,
    description: 'Chorraha yonidagi quti.',
    outcome: 'approved', photo: true, ageDays: 12,
    reviewNote: 'Surat va koordinatalar mos keldi. Tasdiqlandi.',
  },
  {
    lat: 38.8651, lng: 65.7975,
    description: 'Park chetidagi quti.',
    outcome: 'approved', photo: true, ageDays: 16,
    reviewNote: 'Joyida ko‘rildi va tasdiqlandi.',
    markVerified: true,
  },
  {
    lat: 38.8521, lng: 65.7902,
    description: 'Mahalla hovlisidagi quti.',
    outcome: 'approved', photo: false, ageDays: 21,
    reviewNote: 'Qabul qilindi. Joyida tekshirish keyinroq o‘tkaziladi.',
  },
  {
    lat: 38.8609, lng: 65.789,
    description: 'Bozor yonida quti bor.',
    outcome: 'rejected', photo: false, ageDays: 9,
    reviewNote: 'Bu joylashuv xaritada allaqachon mavjud — takroriy taklif.',
  },
  {
    lat: 38.9412, lng: 65.9025,
    description: 'Shahar tashqarisidagi quti.',
    outcome: 'rejected', photo: false, ageDays: 14,
    reviewNote: 'Koordinatalar Qarshi shahri hududidan tashqarida.',
  },
  {
    lat: 38.8667, lng: 65.7861,
    description: 'Surat aniq emas.',
    outcome: 'rejected', photo: true, ageDays: 18,
    reviewNote: 'Suratda quti ko‘rinmaydi. Aniqroq surat bilan qayta yuboring.',
  },
];

/**
 * Problem reports. `binIndex` points into QARSHI_DEMO_BINS.
 *
 * `finalStatus` drives the seeder through binmap_review_report, so the audit
 * log and the needs_recheck clearing behave exactly as they do in the app.
 */
export const QARSHI_DEMO_REPORTS = [
  { binIndex: 0, type: 'overflowing', description: 'Quti to‘lib ketgan, atrofga chiqindi to‘kilgan.', finalStatus: 'submitted', photo: true, ageDays: 1 },
  { binIndex: 1, type: 'overflowing', description: 'Ertalabdan to‘lgan holatda.', finalStatus: 'reviewing', photo: false, ageDays: 2, adminNote: 'Hudud xizmatiga xabar berildi.' },
  { binIndex: 3, type: 'damaged', description: 'Qopqog‘i sinib tushgan.', finalStatus: 'confirmed', photo: true, ageDays: 3, adminNote: 'Joyida ko‘rildi, shikast tasdiqlandi.' },
  { binIndex: 5, type: 'overflowing', description: 'Maktab yonida juda tez to‘ladi.', finalStatus: 'resolved', photo: false, ageDays: 11, adminNote: 'Tozalangani tekshirildi.' },
  { binIndex: 7, type: 'damaged', description: 'Yon tomoni egilgan.', finalStatus: 'resolved', photo: true, ageDays: 15, adminNote: 'Ta’mirlangan.' },
  // A "missing" report flags the bin for re-verification but never deletes it.
  { binIndex: 12, type: 'missing', description: 'Ko‘rsatilgan joyda quti topilmadi.', finalStatus: 'submitted', photo: false, ageDays: 2 },
  { binIndex: 16, type: 'missing', description: 'Quti olib ketilganga o‘xshaydi.', finalStatus: 'reviewing', photo: true, ageDays: 4, adminNote: 'Joyida tekshirish rejalashtirildi.' },
  { binIndex: 19, type: 'other', description: 'Quti yo‘lkani to‘sib qo‘ygan.', finalStatus: 'submitted', photo: false, ageDays: 5 },
  { binIndex: 2, type: 'overflowing', description: 'Hafta oxirida to‘lib qoladi.', finalStatus: 'resolved', photo: false, ageDays: 19, adminNote: 'Tozalandi.' },
  { binIndex: 8, type: 'damaged', description: 'Pedali ishlamaydi.', finalStatus: 'rejected', photo: false, ageDays: 13, adminNote: 'Qayta ko‘rildi — quti ishlayapti.' },
  { binIndex: 22, type: 'other', description: 'Atrofida yorug‘lik yo‘q, kechasi ko‘rinmaydi.', finalStatus: 'submitted', photo: false, ageDays: 7 },
  { binIndex: 25, type: 'overflowing', description: 'Uch kundan beri to‘lgan.', finalStatus: 'confirmed', photo: true, ageDays: 6, adminNote: 'Tasdiqlandi, tozalash kutilmoqda.' },
];

/** Demonstration accounts. Passwords are generated at seed time, never stored here. */
export const QARSHI_DEMO_USERS = [
  { key: 'admin', email: 'moderator@namuna.binmap.uz', fullName: 'Namuna Moderator', role: 'admin' },
  { key: 'user1', email: 'dilnoza@namuna.binmap.uz', fullName: 'Dilnoza Rahimova', role: 'user' },
  { key: 'user2', email: 'bekzod@namuna.binmap.uz', fullName: 'Bekzod Qurbonov', role: 'user' },
  { key: 'user3', email: 'sevara@namuna.binmap.uz', fullName: 'Sevara Yoʻldosheva', role: 'user' },
  { key: 'user4', email: 'jahongir@namuna.binmap.uz', fullName: 'Jahongir Ernazarov', role: 'user' },
];
