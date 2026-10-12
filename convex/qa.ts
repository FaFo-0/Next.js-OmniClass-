// Operator-only fixtures. Not a public function or an authentication bypass.
import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { ACADEMY_ID, tenantTable } from './lib/tenant';
import { assertQaBackendEnvironment } from './lib/qaSafety';

export const seed = internalMutation({
  args: {
    accounts: v.array(v.object({
      key: v.string(), externalId: v.string(), email: v.string(), name: v.string(),
      role: v.union(v.literal('admin'), v.literal('teacher'), v.literal('student')),
      locale: v.union(v.literal('en'), v.literal('ru'), v.literal('kk')),
    })),
    replenish: v.boolean(),
  },
  handler: async (ctx, { accounts, replenish }) => {
    // Fail closed even if someone accidentally runs this on production.
    const issuer = assertQaBackendEnvironment(process.env.CONVEX_CLOUD_URL, process.env.CLERK_JWT_ISSUER_DOMAIN);
    const expected = [
      ['admin', 'admin', 'en', 'qa-admin+omniclass@example.com'],
      ['teacher', 'teacher', 'en', 'qa-teacher+omniclass@example.com'],
      ['student', 'student', 'ru', 'qa-student-ru+omniclass@example.com'],
      ['student-kk', 'student', 'kk', 'qa-student-kk+omniclass@example.com'],
    ];
    if (accounts.length !== expected.length || new Set(accounts.map(a => a.externalId)).size !== expected.length ||
        expected.some(([key, role, locale, email]) => !accounts.some(a => a.key === key && a.role === role && a.locale === locale && a.email === email && a.externalId.startsWith('user_')))) {
      throw new Error('Unexpected QA identity set');
    }
    const teacher = accounts.find(a => a.key === 'teacher')!;
    const admin = accounts.find(a => a.key === 'admin')!;
    const now = new Date().toISOString();
    const date = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));
    const users = tenantTable(ctx, ACADEMY_ID, 'users');
    for (const account of accounts) {
      const existing = await users.query().withIndex('by_organization_and_externalId', q => q.eq('organizationId', ACADEMY_ID).eq('externalId', account.externalId)).unique();
      if (existing && existing.email !== account.email) throw new Error('QA identity collision');
      if (!existing) await users.insert({
        externalId: account.externalId, tokenIdentifier: `${issuer.replace(/\/$/, '')}|${account.externalId}`,
        email: account.email, name: account.name, role: account.role, locale: account.locale,
        onboardingComplete: true, timezone: 'Asia/Almaty', createdAt: now,
        ...(account.role === 'student' ? { teacherId: teacher.externalId, studentStatus: 'active' } : {}),
        ...(account.role === 'teacher' ? { payoutPerLesson: 5000, payoutCurrency: 'KZT', bio: 'Fictional QA teacher' } : {}),
      });
    }
    const works = tenantTable(ctx, ACADEMY_ID, 'libraryWorks');
    const existingWork = await works.query().withIndex('by_organization_and_externalId', q => q.eq('organizationId', ACADEMY_ID).eq('externalId', 'qa:v1:reading')).unique();
    const workId = existingWork?._id ?? await works.insert({ externalId: 'qa:v1:reading', title: 'QA · A morning at the market', kind: 'story', levelCEFR: 'A2', topicTags: ['daily life'], description: 'Original fictional QA reading.', license: 'original', uploadedBy: admin.externalId, isPublished: true, createdAt: now });
    const units = tenantTable(ctx, ACADEMY_ID, 'libraryUnits');
    if (!(await units.query().withIndex('by_workId_and_externalId', q => q.eq('workId', workId).eq('externalId', 'qa:v1:chapter')).unique())) {
      await units.insert({ workId, externalId: 'qa:v1:chapter', position: 0, title: 'The market', contentMarkdown: 'Anna carries a basket to the market. She buys a fresh apple and some bread. The friendly seller smiles. Anna walks home and prepares breakfast.', estimatedReadMinutes: 1, createdAt: now });
    }
    const vacancies = tenantTable(ctx, ACADEMY_ID, 'teacherVacancies');
    const slots = await vacancies.query().withIndex('by_organization_and_teacherId', q => q.eq('organizationId', ACADEMY_ID).eq('teacherId', teacher.externalId)).take(50);
    for (let day = 0; day < 7; day++) {
      if (!slots.some(s => s.dayOfWeek === day && s.isActive)) await vacancies.insert({ teacherId: teacher.externalId, dayOfWeek: day, startTime: '09:00', endTime: '21:00', validFrom: date(0), isActive: true, createdAt: now });
    }
    for (const student of accounts.filter(a => a.role === 'student')) {
      const owner = student.externalId;
      const onboarding = tenantTable(ctx, ACADEMY_ID, 'studentOnboarding');
      if (!(await onboarding.query().withIndex('by_organization_and_studentId', q => q.eq('organizationId', ACADEMY_ID).eq('studentId', owner)).unique())) {
        await onboarding.insert({ studentId: owner, age: 25, l1: student.locale, cefrSelfAssessed: 'A2', goal: 'Fictional QA learner', timezone: 'Asia/Almaty', completedAt: now });
      }
      const grants = tenantTable(ctx, ACADEMY_ID, 'pointGrants');
      const existingGrants = await grants.query().withIndex('by_organization_and_studentId', q => q.eq('organizationId', ACADEMY_ID).eq('studentId', owner)).take(200);
      const balance = existingGrants.filter(g => !g.isExpired && g.expiresAt > now).reduce((sum, g) => sum + g.remainingPoints, 0);
      if (!existingGrants.length || (replenish && balance < 100)) {
        const amount = 100 - balance;
        const grantId = await grants.insert({ studentId: owner, points: amount, remainingPoints: amount, purchasedAt: now, expiresAt: '2099-12-31T23:59:59.000Z', source: 'manual', grantedBy: admin.externalId, notes: 'QA development credits' });
        await tenantTable(ctx, ACADEMY_ID, 'pointTransactions').insert({ studentId: owner, type: 'grant', amount, balanceAfter: balance + amount, grantId, performedBy: admin.externalId, reason: 'QA development credits', createdAt: now });
      }
      const decks = tenantTable(ctx, ACADEMY_ID, 'srsDecks');
      const existingDeck = await decks.query().withIndex('by_organization_and_ownerId', q => q.eq('organizationId', ACADEMY_ID).eq('ownerId', owner)).take(50);
      const deckId = existingDeck.find(d => d.externalId === 'qa:v1:words')?._id ?? await decks.insert({ externalId: 'qa:v1:words', name: 'QA words', ownerId: owner, source: 'manual', isDefault: true, createdAt: now });
      const cards = tenantTable(ctx, ACADEMY_ID, 'srsCards');
      const existingCards = await cards.query().withIndex('by_organization_and_ownerId', q => q.eq('organizationId', ACADEMY_ID).eq('ownerId', owner)).take(100);
      for (const [word, ru, kk] of [['basket', 'корзина', 'себет'], ['apple', 'яблоко', 'алма'], ['bread', 'хлеб', 'нан']]) {
        const cardId = `qa:v1:${student.key}:${word}`;
        const existing = existingCards.find(c => c.cardId === cardId);
        if (existing) {
          if (replenish) await cards.patch(existing._id, { nextReviewDate: date(0), isDeleted: false });
        } else await cards.insert({ cardId, deckId, ownerId: owner, front: word, back: student.locale === 'ru' ? ru : kk, translation: student.locale === 'ru' ? ru : kk, translationLocale: student.locale, sourceWorkId: workId, addedBy: 'system', interval: 0, easeFactor: 2.5, repetitions: 0, nextReviewDate: date(0), lastReviewDate: null });
      }
      const events = tenantTable(ctx, ACADEMY_ID, 'scheduleEvents');
      const lessons = tenantTable(ctx, ACADEMY_ID, 'lessons');
      const history = await events.query().withIndex('by_organization_and_studentId', q => q.eq('organizationId', ACADEMY_ID).eq('studentId', owner)).take(200);
      for (const [key, status, offset] of [['completed', 'completed', -2], ['cancelled', 'cancelled', -1], ['missed', 'no_show_student', -3]] as const) {
        const externalId = `qa:v1:${student.key}:${key}`;
        let eventId = history.find(e => e.externalId === externalId)?._id;
        if (!eventId) eventId = await events.insert({ externalId, teacherId: teacher.externalId, studentId: owner, type: '1on1', title: `QA · ${key} lesson`, date: date(offset), startTime: '10:00', endTime: '11:00', status, createdAt: now });
        if (key !== 'completed') continue;
        const existingLesson = await lessons.query().withIndex('by_organization_and_externalId', q => q.eq('organizationId', ACADEMY_ID).eq('externalId', externalId)).unique();
        const lessonId = existingLesson?._id ?? await lessons.insert({ externalId, teacherId: teacher.externalId, studentId: owner, title: 'QA · Market conversation', status: 'published', transcript: 'Teacher: What did you buy?\nStudent: I bought an apple and some bread.', summary: 'Practised shopping vocabulary and past tense.', contentStatus: { summary: 'approved', vocabulary: 'approved', flashcards: 'approved', quiz: 'approved' }, durationSeconds: 3600, order: 0, scheduleEventId: eventId, createdAt: now, publishedAt: now });
        const homework = tenantTable(ctx, ACADEMY_ID, 'homework');
        const existingHomework = await homework.query().withIndex('by_organization_and_studentId', q => q.eq('organizationId', ACADEMY_ID).eq('studentId', owner)).take(100);
        for (const state of ['assigned', 'submitted', 'reviewed'] as const) {
          const title = `QA · Market homework (${state})`;
          if (!existingHomework.some(h => h.title === title)) await homework.insert({ lessonId, teacherId: teacher.externalId, studentId: owner, title, status: state,
            contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yesterday I ' }, { type: 'studentBlank', attrs: { label: 'past tense of buy', expected: 'bought', answer: state === 'assigned' ? '' : 'bought' } }, { type: 'text', text: ' an apple.' }] }] },
            assignedAt: now, dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), dueDateMode: 'manual', createdAt: now, updatedAt: now,
            ...(state !== 'assigned' ? { submittedAt: now } : {}), ...(state === 'reviewed' ? { reviewedAt: now, score: 1, maxScore: 1, teacherComment: 'Well done! Fictional QA feedback.' } : {}),
          });
        }
      }
    }
    return { accounts: accounts.length, students: 2, creditsPerStudent: 100, reading: workId, replenished: replenish };
  },
});
