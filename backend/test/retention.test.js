jest.mock('fs/promises', () => ({ readdir: jest.fn(), stat: jest.fn(), unlink: jest.fn() }));
const fs = require('fs/promises'), path = require('path');
const { applyRetention } = require('../src/retention');
const { ownedMediaPath, completeDeletion } = require('../src/accountDeletion');
const entry = (name, file = true) => ({ name, isFile: () => file });
test('retention expires only abandoned consents/tokens and old unreferenced generated files', async () => {
  const now = 1000000000, root = path.resolve('synthetic-uploads');
  const referenced = '11111111-1111-4111-8111-111111111111.jpg', orphan = '22222222-2222-4222-8222-222222222222.jpg';
  const speech = 'a'.repeat(64) + '.mp3', fresh = 'b'.repeat(64) + '.mp3';
  const prisma = { familyConsent: { updateMany: jest.fn() }, authChallenge: { deleteMany: jest.fn() }, passwordResetToken: { deleteMany: jest.fn() },
    user: { count: jest.fn(async query => query.where.OR[0].photoUrl.endsWith.includes(referenced) ? 1 : 0) } };
  fs.readdir.mockImplementation(async directory => directory === root
    ? [entry(referenced), entry(orphan), entry('legacy-original.png'), entry('../outside.jpg'), entry('tts', false)]
    : [entry(speech), entry(fresh), entry('private.mp3'), entry('c'.repeat(64) + '.mp3', false)]);
  fs.stat.mockImplementation(async file => ({ mtimeMs: file.endsWith(fresh) ? now : now - 90000000 }));
  fs.unlink.mockResolvedValue();
  await applyRetention(prisma, root, now);
  expect(fs.unlink.mock.calls.map(([file]) => file)).toEqual([path.join(root, orphan), path.join(root, 'tts', speech)]);
  expect(prisma.familyConsent.updateMany.mock.calls[0][0].where.status.in).not.toContain('APPROVED');
  expect(prisma.familyConsent.updateMany.mock.calls[0][0].data.document).toBeNull();
});
test('account media deletion rejects traversal and non-profile files', () => {
  expect(ownedMediaPath('https://synthetic.invalid/uploads/../../config.env', '/uploads')).toBeNull();
  expect(ownedMediaPath('https://synthetic.invalid/uploads/tts/a.mp3', '/uploads')).toBeNull();
  expect(ownedMediaPath('file:///private/passwords.txt', '/uploads')).toBeNull();
});
test('failed subscription cancellation keeps deletion retryable and never deletes user data prematurely', async () => {
  const prisma = { user: { findUnique: async () => ({ id: 'test', subscriptions: [{ status: 'active', stripeSubscriptionId: 'synthetic' }], managedChildren: [] }) }, $transaction: jest.fn() };
  const cancel = jest.fn().mockRejectedValue(Error('provider unavailable'));
  await expect(completeDeletion({ id: 'job', userId: 'test' }, { prisma, stripe: { subscriptions: { cancel } }, uploadsDir: '/uploads' })).rejects.toThrow();
  expect(cancel).toHaveBeenCalledWith('synthetic', { invoice_now: false, prorate: false });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
