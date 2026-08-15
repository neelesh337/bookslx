import { Request, Response, NextFunction } from 'express';
import { disputeService } from '../services/disputeService';

export class DisputeController {
  async raiseDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { orderId, reason, description, evidences } = req.body;
      const dispute = await disputeService.raiseDispute(userId, orderId, { reason, description, evidences });
      return res.status(201).json({
        success: true,
        message: 'Dispute submitted successfully',
        data: dispute,
      });
    } catch (error) {
      next(error);
    }
  }

  async resolveDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUserId = req.user!.id;
      const { id } = req.params;
      const { resolutionOutcome, resolutionNotes } = req.body;
      const result = await disputeService.adminResolveDispute(adminUserId, id, { resolutionOutcome, resolutionNotes });
      return res.json({
        success: true,
        message: `Dispute resolved with outcome ${resolutionOutcome}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDisputes(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const disputes = await disputeService.getDisputes(userId);
      return res.json({
        success: true,
        data: disputes,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const disputeController = new DisputeController();
