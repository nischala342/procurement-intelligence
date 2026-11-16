import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import type { CreateItemInput, ListItemsQuery, UpdateItemInput } from './schema';
import * as itemService from './service';

// Controllers only translate HTTP <-> service calls. Inputs were already validated by middleware.
const idOf = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response) {
  const { items, meta } = await itemService.listItems(req.query as unknown as ListItemsQuery);
  return sendSuccess(res, items, meta);
}

export async function getOne(req: Request, res: Response) {
  return sendSuccess(res, await itemService.getItem(idOf(req)));
}

export async function create(req: Request, res: Response) {
  return sendSuccess(res, await itemService.createItem(req.body as CreateItemInput), undefined, 201);
}

export async function update(req: Request, res: Response) {
  return sendSuccess(res, await itemService.updateItem(idOf(req), req.body as UpdateItemInput));
}

export async function remove(req: Request, res: Response) {
  const item = await itemService.deleteItem(idOf(req));
  return sendSuccess(res, { id: String(item._id), deleted: true });
}
