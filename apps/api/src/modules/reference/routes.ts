import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { listCurrencies } from './currency';
import { listUnits } from './units';

export const referenceRouter = Router();

// Static reference data; no service/model layer needed.
referenceRouter.get('/', (_req: Request, res: Response) =>
  sendSuccess(res, { units: listUnits(), currency: listCurrencies() }),
);
