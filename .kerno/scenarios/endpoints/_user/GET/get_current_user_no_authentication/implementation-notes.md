Perfect! The scenario is now complete and verified. 

The implementation was straightforward:
1. **CallHttp step**: Makes a GET request to `/api/user` without any Authorization header
2. **HttpAssert step**: Verifies the response is 401 Unauthorized with the expected error message body

The API correctly returns a 401 status with a JSON error message `{"status":"error","message":"missing authorization credentials"}` when authentication is missing, which aligns with the `auth.required` middleware protecting this endpoint.

The scenario passed two consecutive runs and is production ready.