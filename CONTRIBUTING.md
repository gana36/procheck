# Contributing to ProCheck

First off, thank you for considering contributing to ProCheck! It's people like you that make ProCheck such a great tool for healthcare professionals.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title** for the issue
* **Describe the exact steps to reproduce the problem**
* **Provide specific examples** to demonstrate the steps
* **Describe the behavior you observed** and what behavior you expected
* **Include screenshots or animated GIFs** if relevant
* **Include your environment details** (OS, browser, Node version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a detailed description** of the suggested enhancement
* **Explain why this enhancement would be useful** to most ProCheck users
* **List any similar features** in other applications if applicable

### Pull Requests

* Fill in the required template
* Follow the TypeScript/Python style guides
* Include thoughtful comments in your code
* End all files with a newline
* Write meaningful commit messages
* Update documentation as needed

## Development Process

### Setting Up Your Development Environment

1. Fork the repo and create your branch from `main`
2. Install dependencies:
   ```bash
   # Frontend
   npm install
   
   # Backend
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Set up environment variables (see `.env.example` files)
4. Make your changes
5. Test your changes thoroughly

### Coding Standards

#### Frontend (TypeScript/React)

* Use TypeScript for all new files
* Follow React best practices and hooks guidelines
* Use functional components with hooks
* Keep components small and focused
* Use meaningful variable and function names
* Add JSDoc comments for complex functions
* Use TailwindCSS for styling (avoid inline styles)
* Ensure accessibility (ARIA labels, keyboard navigation)

Example:
```typescript
/**
 * Handles user message submission with validation and error handling
 * @param content - The message content to send
 * @returns Promise that resolves when message is sent
 */
const handleSendMessage = async (content: string): Promise<void> => {
  // Implementation
};
```

#### Backend (Python/FastAPI)

* Follow PEP 8 style guide
* Use type hints for all function parameters and returns
* Write docstrings for all functions and classes
* Keep functions small and focused
* Use meaningful variable names
* Handle errors gracefully with proper logging
* Use async/await for I/O operations

Example:
```python
async def search_protocols(
    query: str,
    use_hybrid: bool = True,
    size: int = 10
) -> SearchResponse:
    """
    Search medical protocols using hybrid search.
    
    Args:
        query: The search query string
        use_hybrid: Whether to use hybrid search (BM25 + vector)
        size: Maximum number of results to return
        
    Returns:
        SearchResponse containing matched protocols
        
    Raises:
        ElasticsearchException: If search fails
    """
    # Implementation
```

### Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

Examples:
```
Add hybrid search feature with RRF ranking

Implement Elasticsearch hybrid search combining BM25 and vector search
using Reciprocal Rank Fusion. Includes query enhancement with Gemini AI.

Fixes #123
```

### Testing

* Write tests for new features
* Ensure all tests pass before submitting PR
* Aim for high test coverage on critical paths

```bash
# Frontend tests
npm run test

# Backend tests
cd backend
pytest
```

### Documentation

* Update README.md if you change functionality
* Add JSDoc/docstrings for new functions
* Update API documentation for backend changes
* Include inline comments for complex logic

## Project Structure

### Frontend
```
src/
├── components/     # React components
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
├── lib/            # Utilities and API clients
└── types/          # TypeScript type definitions
```

### Backend
```
backend/
├── config/         # Configuration
├── services/       # Business logic
├── models/         # Data models
├── utils/          # Utilities
└── main.py         # Entry point
```

## Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release!

## Recognition

Contributors will be recognized in:
* The project README
* Release notes
* Our contributors page

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to ProCheck!
