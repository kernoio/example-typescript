Perfect! The scenario has been successfully implemented and verified. The scenario now:

1. **Generates random test data** - Creates unique email, username values and a static password
2. **Creates an existing user** - Inserts a user directly into the database with a pre-hashed password, with defensive cleanup first
3. **Attempts duplicate registration** - Calls POST /api/users with the same email but different username
4. **Asserts the error response** - Verifies 422 status with the correct error message format
5. **Cleans up** - Removes the test user to ensure repeatability

The scenario passed on two consecutive runs, confirming it is repeatable and production-ready. The implementation correctly handles the duplicate email validation as expected by the API.