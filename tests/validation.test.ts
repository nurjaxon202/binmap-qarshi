import { describe, expect, it } from 'vitest';

import {
  adminBinUpdateSchema,
  binReportSchema,
  binSubmissionSchema,
  fieldErrors,
  loginSchema,
  registerSchema,
  submissionReviewSchema,
  verificationSchema,
} from '@/lib/validation';

/**
 * Validation is the boundary every untrusted value crosses, so these tests
 * cover the shapes a browser actually sends — including the ones that bit us:
 * `formData.get()` returns null for a field that was not submitted, which an
 * unchecked checkbox always is.
 */

describe('registerSchema', () => {
  it('accepts a normal sign-up and normalises the address', () => {
    const result = registerSchema.safeParse({
      email: '  Dilnoza@Example.UZ ',
      password: 'parol12345',
      fullName: '  Dilnoza Rahimova  ',
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('dilnoza@example.uz');
    expect(result.data?.fullName).toBe('Dilnoza Rahimova');
  });

  it('rejects a short password with an Uzbek message', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.uz',
      password: 'qisqa',
      fullName: 'Ism',
    });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).password).toContain('8 belgidan');
  });

  it('rejects malformed addresses', () => {
    for (const email of ['not-an-email', 'a@b', 'a@@b.uz', '@b.uz', 'a b@c.uz']) {
      const result = registerSchema.safeParse({ email, password: 'parol12345', fullName: 'Ism' });
      expect(result.success, email).toBe(false);
    }
  });
});

describe('loginSchema', () => {
  it('does not impose a length rule on the password, only presence', () => {
    // A rule here would leak what the password policy was when the account was
    // made, and would reject a legitimate older password.
    expect(loginSchema.safeParse({ email: 'a@b.uz', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.uz', password: '' }).success).toBe(false);
  });
});

describe('binSubmissionSchema', () => {
  const base = { citySlug: 'qarshi', latitude: '38.8606', longitude: '65.7891' };

  it('coerces coordinates that arrive as form strings', () => {
    const result = binSubmissionSchema.safeParse({ ...base, description: '', acknowledgedDuplicate: 'false' });
    expect(result.success).toBe(true);
    expect(result.data?.latitude).toBe(38.8606);
    expect(result.data?.longitude).toBe(65.7891);
  });

  it('turns an empty description into null rather than an empty string', () => {
    const result = binSubmissionSchema.safeParse({ ...base, description: '' });
    expect(result.data?.description).toBeNull();
  });

  it('accepts a missing description, which arrives as null from FormData', () => {
    const result = binSubmissionSchema.safeParse({ ...base, description: null });
    expect(result.success).toBe(true);
    expect(result.data?.description).toBeNull();
  });

  it('reads the duplicate acknowledgement from every shape a checkbox sends', () => {
    const parse = (v: unknown) =>
      binSubmissionSchema.safeParse({ ...base, acknowledgedDuplicate: v }).data
        ?.acknowledgedDuplicate;

    expect(parse('true')).toBe(true);
    expect(parse('on')).toBe(true);
    expect(parse(true)).toBe(true);
    // An unchecked checkbox is absent from the FormData entirely.
    expect(parse(null)).toBe(false);
    expect(parse(undefined)).toBe(false);
    expect(parse('false')).toBe(false);
  });

  it('rejects coordinates outside the world', () => {
    expect(binSubmissionSchema.safeParse({ ...base, latitude: '91' }).success).toBe(false);
    expect(binSubmissionSchema.safeParse({ ...base, longitude: '181' }).success).toBe(false);
    expect(binSubmissionSchema.safeParse({ ...base, latitude: 'abc' }).success).toBe(false);
  });

  it('rejects an over-long description', () => {
    const result = binSubmissionSchema.safeParse({ ...base, description: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('binReportSchema', () => {
  const bin = { binId: '4dce3cac-3ab8-4b98-a1a1-c65546869ed7' };

  it('accepts the four report types', () => {
    for (const reportType of ['overflowing', 'damaged', 'missing', 'other'] as const) {
      const description = reportType === 'other' ? 'Yo‘lkani to‘sib qo‘ygan' : null;
      expect(binReportSchema.safeParse({ ...bin, reportType, description }).success).toBe(true);
    }
  });

  it('requires a description only for "other"', () => {
    const result = binReportSchema.safeParse({ ...bin, reportType: 'other', description: null });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).description).toContain('izoh');

    expect(
      binReportSchema.safeParse({ ...bin, reportType: 'overflowing', description: null }).success,
    ).toBe(true);
  });

  it('rejects an unknown report type', () => {
    expect(binReportSchema.safeParse({ ...bin, reportType: 'exploded' }).success).toBe(false);
  });
});

describe('submissionReviewSchema', () => {
  it('requires a reason when rejecting', () => {
    const result = submissionReviewSchema.safeParse({ decision: 'reject', note: null });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).note).toContain('sabab');
  });

  it('does not require a note when approving', () => {
    const result = submissionReviewSchema.safeParse({ decision: 'approve', note: null });
    expect(result.success).toBe(true);
  });

  it('treats an unchecked verification box as "not verified"', () => {
    // This is the bug that made the approve button do nothing: an unchecked
    // checkbox is absent, so FormData yields null, which `.optional()` rejects.
    const result = submissionReviewSchema.safeParse({
      decision: 'approve',
      note: null,
      markVerified: null,
      latitude: null,
      longitude: null,
      description: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.markVerified).toBe(false);
  });

  it('accepts an explicit verification tick', () => {
    const result = submissionReviewSchema.safeParse({ decision: 'approve', markVerified: 'true' });
    expect(result.data?.markVerified).toBe(true);
  });

  it('accepts empty coordinate corrections', () => {
    const result = submissionReviewSchema.safeParse({
      decision: 'approve',
      latitude: '',
      longitude: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown decision', () => {
    expect(submissionReviewSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
});

describe('adminBinUpdateSchema', () => {
  it('accepts the documented statuses only', () => {
    const base = {
      latitude: '38.8606',
      longitude: '65.7891',
      description: null,
      verificationStatus: 'verified',
      note: null,
    };
    expect(adminBinUpdateSchema.safeParse({ ...base, status: 'active' }).success).toBe(true);
    expect(adminBinUpdateSchema.safeParse({ ...base, status: 'deleted' }).success).toBe(false);
    expect(
      adminBinUpdateSchema.safeParse({ ...base, status: 'active', verificationStatus: 'great' })
        .success,
    ).toBe(false);
  });
});

describe('fieldErrors', () => {
  it('keeps the first message per field and puts form-level ones under _form', () => {
    const result = registerSchema.safeParse({ email: 'bad', password: 'x', fullName: '' });
    const errors = fieldErrors(result.error!);
    expect(Object.keys(errors).sort()).toEqual(['email', 'fullName', 'password']);
    expect(typeof errors.email).toBe('string');
  });
});

describe('verificationSchema', () => {
  it('accepts the two outcomes a visit can have', () => {
    for (const outcome of ['verified', 'needs_recheck']) {
      const parsed = verificationSchema.safeParse({
        binId: 'b2f1c6a0-0000-4000-8000-000000000000',
        outcome,
        note: null,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('has no date field — the database stamps it', () => {
    const parsed = verificationSchema.safeParse({
      binId: 'b2f1c6a0-0000-4000-8000-000000000000',
      outcome: 'verified',
      note: null,
      verifiedAt: '2020-01-01',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty('verifiedAt');
  });

  it('refuses an invented outcome', () => {
    const parsed = verificationSchema.safeParse({
      binId: 'b2f1c6a0-0000-4000-8000-000000000000',
      outcome: 'removed',
      note: null,
    });
    expect(parsed.success).toBe(false);
  });
});
