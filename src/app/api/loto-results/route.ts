
import { NextResponse } from 'next/server';

/**
 * @deprecated This API route is no longer in use.
 * The data fetching logic has been moved directly into the `src/services/lotoData.ts` service
 * in the `_fetchAndProcessExternalApi` function. This was done to simplify the architecture by
 * removing the internal proxy layer and to allow the service layer to handle fetching and
 * processing from the external `lotobonheur.ci` API directly.
 *
 * This file can be safely deleted.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'This API route is deprecated and no longer in use.',
      message: 'Please see the source code of this file for more details.',
    },
    { status: 410 } // 410 Gone
  );
}
