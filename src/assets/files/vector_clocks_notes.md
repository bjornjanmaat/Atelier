# Vector Clocks & State Machine Replication

## Summary
A vector clock is an algorithm for generating a partial ordering of events in a distributed system and detecting causality violations.

### Mathematical Invariants
1. **Clock Vector**: Each node maintains a vector V of size N.
2. **Local Event**: Process increments its own component V[i] += 1.
3. **Message Send**: Process sends timestamp vector V with message.
4. **Message Receive**: Recipient takes component-wise max:
   V[k] = max(V[k], V_msg[k]), then increments V[i] += 1.

### Causality Comparison
- Event A happens before B (A -> B) iff V(A) <= V(B) and V(A) != V(B).
- Concurrent events (A || B) occur when neither dominates.
