'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/shared/core.js');

const groups = [
  { id: 'mpc', name: 'MPC', command: '#MPC', keywords: ['github.com/eissasoubhi/mpc', 'PLink'], enabled: true },
  { id: 'jobpilot', name: 'JobPilot', command: '#JobPilot', keywords: ['job scoring'], enabled: true }
];

test('explicit command wins classification', () => {
  const result = Core.classifyConversation({ id: '1', title: '#MPC fix job scoring' }, groups, {});
  assert.equal(result.groupId, 'mpc');
  assert.equal(result.strength, 'command');
});

test('project name prefix classifies a chat', () => {
  const result = Core.classifyConversation({ id: '2', title: 'JobPilot — deploy Oracle' }, groups, {});
  assert.equal(result.groupId, 'jobpilot');
  assert.equal(result.strength, 'project-prefix');
});

test('keyword classifies from title or first message', () => {
  const result = Core.classifyConversation({ id: '3', title: 'Ranking issue', firstMessage: 'PLink duplicates are wrong' }, groups, {});
  assert.equal(result.groupId, 'mpc');
  assert.equal(result.strength, 'keyword');
});

test('manual override beats automatic rules', () => {
  const result = Core.classifyConversation({ id: '4', title: '#MPC ranking' }, groups, { '4': 'jobpilot' });
  assert.equal(result.groupId, 'jobpilot');
  assert.equal(result.strength, 'manual');
});

test('longer keyword wins when groups both match', () => {
  const result = Core.classifyConversation(
    { id: '5', title: 'foo bar baz' },
    [
      { id: 'a', name: 'A', command: '', keywords: ['foo'], enabled: true },
      { id: 'b', name: 'B', command: '', keywords: ['foo bar'], enabled: true }
    ],
    {}
  );
  assert.equal(result.groupId, 'b');
});

test('unknown chat remains unclassified internally', () => {
  const result = Core.classifyConversation({ id: '6', title: 'Burger recipe' }, groups, {});
  assert.equal(result.groupId, null);
  assert.equal(result.strength, 'none');
});

test('conversation id is extracted from supported URLs', () => {
  assert.equal(Core.deriveConversationId('/c/abc-123'), 'abc-123');
  assert.equal(Core.deriveConversationId('https://chatgpt.com/g/gpt-id/c/xyz?q=1'), 'xyz');
  assert.equal(Core.deriveConversationId('/'), null);
});

test('display title removes command and project prefix', () => {
  assert.equal(Core.cleanDisplayTitle('#MPC — Fix extension', groups[0]), 'Fix extension');
  assert.equal(Core.cleanDisplayTitle('MPC — Fix extension', groups[0]), 'Fix extension');
});

test('settings migration sanitizes malformed values and drops legacy unclassified UI setting', () => {
  const settings = Core.migrateSettings({
    groups: [{ name: ' MPC ', keywords: [' x ', '', 9] }],
    autoScan: false,
    showUnclassified: true
  });
  assert.equal(settings.groups[0].name, 'MPC');
  assert.deepEqual(settings.groups[0].keywords, ['x', '9']);
  assert.equal(settings.autoScan, false);
  assert.equal('showUnclassified' in settings, false);
});

test('ui state starts with groups closed and native projects hidden', () => {
  const state = Core.migrateUiState(null, groups);
  assert.deepEqual(state.openGroups, {});
  assert.equal(state.projectsVisible, false);
});

test('ui state keeps only open known groups', () => {
  const state = Core.migrateUiState({
    openGroups: { mpc: true, jobpilot: false, deleted: true },
    projectsVisible: true
  }, groups);
  assert.deepEqual(state.openGroups, { mpc: true });
  assert.equal(state.projectsVisible, true);
});
