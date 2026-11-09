import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getSelfHostedSigningKeys } from '@/lib/api/self-hosted/signing-keys'

export default function signingKeys(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    return res.status(200).json(await getSelfHostedSigningKeys())
  } catch {
    return res.status(502).json({ message: 'Unable to load public JWT signing keys. Try again.' })
  }
}
