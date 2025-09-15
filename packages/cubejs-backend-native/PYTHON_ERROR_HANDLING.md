# UserError vs Internal Server Error Handling for Python Functions

Python functions in Cube can now distinguish between user errors and internal server errors. When a `UserError` is raised in Python, it returns HTTP 400 Bad Request instead of HTTP 500 Internal Server Error, allowing proper error handling with appropriate HTTP status codes.

## Problem

When Python functions raise exceptions, they were always converted to HTTP 500 Internal Server Error responses, regardless of the actual error type. This prevented:

- Returning appropriate HTTP status codes for different error scenarios
- Distinguishing between client errors (4xx) and server errors (5xx)
- Providing meaningful error responses to API consumers

## Solution

Python functions can raise `UserError` exceptions to indicate client-side errors, which are detected by string parsing in the JavaScript API Gateway. All other exceptions continue to return HTTP 500.

## Implementation

### Python Side

In your Python configuration file (e.g., `config.py`), define the `UserError` class and use it in your functions:

```python
# Define UserError class (simple inheritance from Exception)
class UserError(Exception):
    """User error that should return HTTP 400 instead of 500"""
    pass

@config
async def check_auth(req, authorization):
    if authorization == "invalid_token":
        raise UserError("Invalid token")
    elif authorization == "expired_token":
        raise UserError("Token expired")
    elif authorization == "bad_request":
        raise UserError("Bad request parameters")
    # Success case...

@config
def logger(msg, params):
    if msg == "config_error":
        raise UserError("Configuration error")
    # Normal logging...

@config
async def repository_factory(ctx):
    if not ctx.get("securityContext"):
        raise UserError("Security context required")
    # Return repository...
```

### Error Types

**UserError (HTTP 400, type: 'User Error'):**

- Client-side validation errors
- Authentication failures
- Authorization failures
- Invalid input parameters
- Missing required fields
- Business logic violations

**Internal Server Error (HTTP 500, type: 'Orchestrator error'):**

- Unexpected server errors
- Database connection failures
- System errors
- Unhandled exceptions
- Infrastructure issues

## How It Works

1. **Python Exception**: A Python function raises a `UserError` for client errors or any other exception for server errors
2. **Error Formatting**: Python errors are formatted as strings with the pattern `"Error: Python error: UserError: [message]"` or `"Error: Python error: [OtherException]: [message]"`
3. **JavaScript Detection**: The API Gateway has two detection points:
   - **Authentication errors** (`checkAuthWrapper`): Detects Python UserErrors and returns HTTP 400 while logging as type `'Auth Error'`
   - **General errors** (`handleError`): Detects Python UserErrors and returns HTTP 400 while logging as type `'User Error'`
4. **Detection Logic**: Uses helper function `isPythonUserError()` that checks for `"Error: Python error: UserError: "` prefix
5. **HTTP Response**:
   - Python UserErrors → HTTP 400 Bad Request (regardless of which function raises them)
   - All other Python errors → HTTP 500 Internal Server Error
   - JavaScript UserErrors → HTTP 400 Bad Request, logged with original type (`'UserError'` or `'User Error'`)

### Error Detection Logic

The JavaScript API Gateway handles Python UserErrors through two detection points:

1. **Authentication Context Detection** (`checkAuthWrapper`):
   - **Purpose**: Handles Python UserErrors from authentication functions (`check_auth`)
   - **Detection**: Uses `isPythonUserError()` helper function to check for `"Error: Python error: UserError: "` prefix
   - **Response**: HTTP 400 Bad Request, logged as type `'Auth Error'`
   - **Flow**: Authentication errors are handled here and don't reach the general error handler

2. **General Error Detection** (`handleError`):
   - **Purpose**: Handles Python UserErrors from all other Python functions (`logger`, `repository_factory`, etc.)
   - **Detection**: Uses `isPythonUserError()` helper function to check for `"Error: Python error: UserError: "` prefix
   - **Response**: HTTP 400 Bad Request, logged as type `'User Error'`
   - **Location**: `else if (e.error)` block in the main error handling chain

3. **Helper Function** (`isPythonUserError`):
   - **Logic**: `errorString.startsWith('Error: Python error: UserError: ')`
   - **Purpose**: Centralized, accurate detection using `startsWith` to avoid false positives
   - **Used by**: Both authentication and general error detection points

## Examples

### Authentication Function

```python
class UserError(Exception):
    pass

@config
async def check_auth(req, authorization):
    if not authorization:
        raise UserError("Missing authorization header")

    if authorization == "invalid_token":
        raise UserError("Invalid token")

    if authorization == "expired_token":
        raise UserError("Token expired")

    return {"security_context": {"sub": "user123"}}
```

### Repository Factory

```python
class UserError(Exception):
    pass

@config
async def repository_factory(ctx):
    if not ctx.get("securityContext"):
        raise UserError("Security context required")

    schema_path = ctx["securityContext"].get("schemaPath")
    if not schema_path:
        raise UserError("Schema path not configured")

    return file_repository(schema_path)
```

### Data Validation

```python
class UserError(Exception):
    pass

@config
def validate_data(data):
    if not isinstance(data, dict):
        raise UserError("Data must be an object")

    if "required_field" not in data:
        raise UserError("Required field missing")

    return True
```

### Configuration Errors

```python
class UserError(Exception):
    pass

@config
def logger(msg, params):
    if msg == "init" and not params.get("log_level"):
        raise UserError("Log level configuration required")

    # Normal logging logic
```

## Testing

You can test the functionality by calling different Python functions:

```bash
# Test authentication errors
curl -H "Authorization: invalid_token" http://localhost:4000/cubejs-api/v1/meta
# Returns: 400 Bad Request

# Test configuration errors
curl -X POST http://localhost:4000/cubejs-api/v1/load -d '{"query": "bad query"}'
# Returns 400 for UserError, 500 for other exceptions

# Test repository errors
# Any function that calls repository_factory will get appropriate error codes
```

## Migration

- **New code**: Define `UserError` class and use it for client-side errors
- **Existing code**: Continue to work unchanged (all exceptions return HTTP 500)
- **Optional enhancement**: Convert existing client error cases to use `UserError`

## Error Handling Best Practices

1. **Use UserError for client errors**:

   ```python
   # Good
   raise UserError("User account is suspended")
   raise UserError("Invalid input parameters")
   raise UserError("Authentication required")

   # Bad - use regular Exception for server errors
   raise Exception("Database connection failed")
   raise Exception("System configuration error")
   ```

2. **Provide clear error messages**:

   ```python
   # Good
   raise UserError("User account is suspended")

   # Bad
   raise UserError("Error")
   ```

3. **Use consistent error format**:
   ```python
   # Always use simple string messages
   raise UserError("Clear error message")
   ```

## Implementation Details

The solution works by:

1. **Error Formatting**: Python errors are automatically formatted as `"Python error: [ExceptionType]: [message]"` including full tracebacks
2. **String-Based Detection**: The JavaScript API Gateway checks for the `"Python error: UserError: "` prefix
3. **HTTP Status Mapping**: Simple string check determines whether to return HTTP 400 or 500
4. **Minimal Changes**: Only requires JavaScript gateway modifications, no complex Rust binding changes
5. **Backward Compatibility**: Existing Python code continues to work unchanged

### Key Technical Advantages

- **Simple Implementation**: Only requires string parsing in JavaScript gateway
- **No Breaking Changes**: Rust backend remains unchanged
- **Preserved Tracebacks**: Full Python tracebacks maintained in error messages
- **Reliable Detection**: String prefix matching is robust and predictable
- **Proper Error Handling Order**: Python errors detected before JavaScript UserErrors to prevent misclassification
- **Dual JavaScript UserError Support**: Handles both Schema Compiler (`'UserError'`) and API Gateway (`'User Error'`) conventions
- **Telemetry Compatibility**: Python UserErrors logged as `'User Error'` to match server telemetry expectations

## Error Message Format

The implementation preserves full error information while providing clear distinction between user and internal errors:

### User Error Response (HTTP 400)
```json
{
  "error": "Python error: UserError: Invalid token provided\nTraceback (most recent call last):\n  File \"config.py\", line 15, in check_auth\n    raise UserError(\"Invalid token provided\")",
  "type": "User Error"
}
```
*Note: In logs and responses, this will be recorded with type `'User Error'` to match the existing JavaScript UserError class constructor `super(400, 'User Error', message)` and server telemetry expectations*.

### Internal Error Response (HTTP 500)
```json
{
  "error": "Python error: ConnectionError: Database connection failed\nTraceback (most recent call last):\n  File \"config.py\", line 20, in query_data\n    connection = db.connect()"
}
```

### Migration Guide

#### For New Python Code
```python
# Define UserError at the top of your config.py
class UserError(Exception):
    """User error that should return HTTP 400 instead of 500"""
    pass

# Use UserError for client-side errors
@config
async def check_auth(req, authorization):
    if not authorization:
        raise UserError("Missing authorization header")
    # ... other validation logic
```

#### For Existing Python Code
No changes required! Existing code continues to work:
- All exceptions currently return HTTP 500 (unchanged behavior)
- Optionally enhance by converting client errors to use `UserError`

#### Best Practices
1. **Use UserError for client-facing errors**: Authentication, validation, authorization
2. **Use regular Exception for server errors**: Database issues, system failures
3. **Provide clear, actionable error messages**: Help users understand and fix issues
4. **Keep error messages simple**: Use strings that can be easily serialized to JSON

## Troubleshooting

### Common Issues

#### Q: My UserError is still returning HTTP 500 instead of 400
**A:** Ensure your `UserError` class is defined correctly and inherits from `Exception`:
```python
# Correct
class UserError(Exception):
    pass

# Incorrect - won't be detected as user error
def UserError():
    pass
```

#### Q: The error detection is not working
**A:** Check that your error messages are properly formatted. The JavaScript gateway looks for the exact prefix `"Python error: UserError: "`. This should happen automatically when you raise a `UserError` exception.

#### Q: My error tracebacks are missing in the response
**A:** The implementation preserves tracebacks through the standard Python error formatting. If tracebacks are missing, check your Python logging configuration and ensure exceptions are being raised correctly.

#### Q: The error detection is not working in async functions
**A:** The implementation works for both sync and async Python functions. Ensure you're using `@config` decorator correctly and that your async functions are properly defined.

### Debug Steps

1. **Check Python Exception Type**: Verify your exception is actually a `UserError`:
   ```python
   try:
       raise UserError("test")
   except Exception as e:
       print(type(e))  # Should be <class '__main__.UserError'>
       print(isinstance(e, UserError))  # Should be True
   ```

2. **Verify HTTP Status**: Check the actual HTTP status code in response headers:
   ```bash
   curl -v http://localhost:4000/cubejs-api/v1/load -d '{"query": "bad query"}'
   # Look for HTTP/1.1 400 Bad Request or HTTP/1.1 500 Internal Server Error
   ```

3. **Check Error Message Format**: Ensure the error message contains the expected prefix:
   ```bash
   # The response should contain "Python error: UserError: " for user errors
   curl http://localhost:4000/cubejs-api/v1/load -d '{"query": "bad query"}' | jq .
   ```

## Summary

This implementation provides a simple, reliable way to distinguish between user errors and internal server errors in Python functions:

- **Define `UserError` class** in your Python code
- **Use `UserError` for client-side errors** to get HTTP 400
- **All other exceptions** continue to return HTTP 500
- **No Rust backend changes** required
- **Backward compatible** with existing code
- **Dual detection points** for comprehensive coverage (authentication + general errors)
- **Centralized helper function** for consistent detection logic

The implementation ensures that all Python UserErrors return HTTP 400 Bad Request regardless of which Python function raises them, while maintaining appropriate log categories ('Auth Error' for authentication context, 'User Error' for general context).