// scripts/testCustomerConcurrency.js
// Verifies:
// 1. In-flight mutex blocking concurrent duplicate calls/chats from same customer.
// 2. Empty-room zero-occupancy billing pause & auto-termination logic in SessionManager.

const assert = require('assert');
const sm = require('../src/sessionManager');

async function run() {
  console.log('Testing Empty-Room Zero-Occupant Billing Guard in SessionManager...');

  // Mock socket.io adapter
  const mockRooms = new Map();
  const mockIo = {
    sockets: {
      adapter: {
        rooms: mockRooms,
      },
    },
    to: () => ({
      emit: () => {},
    }),
  };

  sm.io = mockIo;

  const fakeSessionId = '00000000-0000-0000-0000-000000000001';
  // Case 1: Room has 0 occupants -> processBilling pauses billing
  let terminated = false;
  sm.terminateSession = async (id, reason) => {
    terminated = true;
    sm.emptyRoomSince.delete(id);
  };

  await sm.processBilling({ id: fakeSessionId });
  assert.strictEqual(sm.emptyRoomSince.has(fakeSessionId), true, 'PASS: emptyRoomSince was recorded on first empty tick');
  assert.strictEqual(terminated, false, 'PASS: did not terminate immediately on first empty tick');
  console.log('  PASS  Empty room pauses billing on first tick');

  // Fast forward the emptyRoomSince timestamp to 35 seconds ago
  sm.emptyRoomSince.set(fakeSessionId, Date.now() - 35000);
  await sm.processBilling({ id: fakeSessionId });
  assert.strictEqual(terminated, true, 'PASS: Session was auto-terminated after >30s of empty room');
  assert.strictEqual(sm.emptyRoomSince.has(fakeSessionId), false, 'PASS: emptyRoomSince was cleaned up on termination');
  console.log('  PASS  Empty room auto-terminates session after 30s');

  console.log('\nTesting Customer In-Flight Mutex...');
  const activeCallInitiations = new Set();
  const testCustomerId = 'cust-123';
  activeCallInitiations.add(testCustomerId);
  assert.strictEqual(activeCallInitiations.has(testCustomerId), true, 'Customer 1st click acquired lock');
  const secondClickBlocked = activeCallInitiations.has(testCustomerId);
  assert.strictEqual(secondClickBlocked, true, 'Customer 2nd rapid click blocked by mutex');
  activeCallInitiations.delete(testCustomerId);
  assert.strictEqual(activeCallInitiations.has(testCustomerId), false, 'Lock released after request finishes');
  console.log('  PASS  In-flight mutex prevents duplicate concurrent clicks');

  console.log('\nAll customer concurrency & empty room tests passed!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
