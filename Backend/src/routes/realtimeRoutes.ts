import { Router } from 'express';
import { authenticateSSE } from '../middleware/authMiddleware';
import { realtimeHub } from '../services/realtimeService';

const router = Router();

// GET /api/realtime/events — long-lived SSE stream of the user's events.
// EventSource auto-reconnects on drops; the server heartbeats every 25s so
// proxies don't close the idle connection.
router.get('/events', authenticateSSE, (req, res) => {
  realtimeHub.subscribe(req.user!.id, res);
});

export default router;
