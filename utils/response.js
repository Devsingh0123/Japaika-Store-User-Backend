export function sendSuccess(res, { statusCode = 200, message = 'Success', data = null }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res,
  { statusCode = 500, code = 'INTERNAL_SERVER_ERROR', message = 'Internal server error', details = [] }
) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}
