
import { createGameEngine } from './src/engine.js';
import { neighbors } from './src/graph.js';

// Mock browser globals if needed (though engine is mostly pure JS)
// engine.js uses 'document' only for nothing, app.js uses it.
// engine.js is pure except for helpers maybe?
// helpers.js is pure.

const engine = createGameEngine();
const state = engine.getRawState();

// 1. Initialize
engine.startGame({
    zMax: 0, // No newcomers to keep it simple
    edgesPerNode: 2,
    pickPeriod: 999, // Disable picking
    shockPeriod: 999,
    purgePeriod: 999,
    budgetMax: 10
});

console.log("Initial friends:", neighbors(state.graph, state.youId).length);

// 2. Add some nodes manually that are CLOSE to 'You' so they can connect
// 'You' is node 0.
// Let's force some nodes into existence and ensuring they are within distance.
// The engine uses `nodesWithinDistance` which relies on existing edges.
// If we have 0 friends initially (seedWorld makes 3 friends usually), we have connections.

// Let's verify we have friends
const initialFriends = neighbors(state.graph, state.youId);
console.log("Initial Friend IDs:", initialFriends);

// 3. Simulate days passing where runCasteConnections is called.
// But runCasteConnections primarily connects *newcomers* or *existing nodes*?
// Let's look at the code:
// "const nodes = [...state.graph.nodes.values()]; for (const node of nodes) { ... if (Math.random() >= rule.makeProb) continue; ... }"
// It runs for ALL nodes every turn (if called).
// But wait, `continueGame` only calls `runCasteConnections(state, newcomers)`
// and passes `newcomers`.
// Inside `runCasteConnections(state, newcomerIds)`:
// It iterates over ALL nodes (`for (const node of nodes)`).
// So existing nodes CAN initiate connections every turn.

// We need to ensure 'You' is a valid target.
// Target logic: `for (const reachId of withinTwo)`
// So 'You' must be within 2 hops of the source node.

// Let's run for 50 turns and see if friends count increases.
let initialCount = initialFriends.length;
let gainedFriend = false;

for (let i = 0; i < 50; i++) {
    engine.continueGame();
    const currentFriends = neighbors(state.graph, state.youId);
    if (currentFriends.length > initialCount) {
        console.log(`Day ${i}: Gained a friend! Count: ${currentFriends.length}`);
        // Check log for the message
        const logs = engine.getLog();
        const lastLog = logs[logs.length - 1]; // might be about shocks or whatever
        // Search strictly for our message
        const match = logs.find(l => l.includes("You were approached by"));
        if (match) {
            console.log("Log confirmation found:", match);
            gainedFriend = true;
            break;
        }
    }
    // If we lose friends due to purge (disabled) it won't matter.
}

if (gainedFriend) {
    console.log("SUCCESS: 'You' gained a friend passively.");
} else {
    console.log("WARNING: 'You' did not gain a friend in 50 days. This might be due to RNG or logic.");
    // It is RNG based (makeProb), so it might fail occasionally, but with 50 days and existing nodes, it should happen.
    // Unless the graph is small and fully connected?
    // Seed world has 3 friends.
    // Total nodes = 1 (You) + 3 (Friends) = 4.
    // If zMax=0, no new nodes.
    // Existing nodes might connect to each other.
    // Can they connect to You?
    // You are already connected to all of them (neighbors).
    // So they cannot add 'You' again (`if (hasEdge(..., targetId)) continue`).

    // Ah! If I am connected to A, B, C.
    // A is distance 1.
    // B is distance 1.
    // If A wants to connect to B (dist 2 from A? No, 1 via You), sure.
    // But nobody can connect to You because You are already connected to everyone in this small world.

    // WE NEED NEW NODES (Newcomers) to spawn, but NOT connect to You instantly.
    // But then existing nodes (the newcomers from previous day) can connect to You later.
}

// Let's retry with zMax > 0
console.log("\n--- Retrying with Growth ---");
engine.startGame({
    zMax: 5,
    edgesPerNode: 1,
    pickPeriod: 999,
    shockPeriod: 999,
    purgePeriod: 999,
    budgetMax: 10
});

initialCount = neighbors(state.graph, state.youId).length;
gainedFriend = false;

for (let i = 0; i < 100; i++) {
    engine.continueGame();
    const currentFriends = neighbors(state.graph, state.youId);
    if (currentFriends.length > initialCount) {
        const logs = engine.getLog();
        // We need to verify it wasn't a "Pick" (pick is disabled).
        // We need to verify it wasn't just a newcomer auto-connect (which we explicitly disabled for You).
        // Wait, we disabled newcomer->You connection in the code: `if (sourceIsNewcomer) targets.delete(state.youId)`.
        // So if we get a friend, it MUST be an EXISTING node connecting to us.

        const match = logs.filter(l => l.includes("You were approached by"));
        if (match.length > 0) {
             console.log(`Day ${i}: Gained passive friend! Count: ${currentFriends.length}`);
             console.log("Log:", match[match.length-1]);
             gainedFriend = true;
             initialCount = currentFriends.length; // Reset to catch more
             // break; // Let's see if we get multiple
        }
    }
}

if (gainedFriend) {
    console.log("SUCCESS: Verified passive connections logic.");
} else {
    console.log("FAILURE: No passive connections formed.");
}
