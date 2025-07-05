# BPMNCode VS Code Extension

Language support for BPMNCode DSL - a domain-specific language for creating BPMN diagrams.

## Features

- **Syntax Highlighting** - Keywords, strings, operators, and element names
- **IntelliSense** - Auto-completion for BPMN elements and attributes
- **Diagnostics** - Real-time error checking and validation
- **Code Actions** - Quick fixes for common errors
- **Go to Definition** - Navigate to element declarations with Ctrl+Click
- **Hover Documentation** - Element descriptions on hover
- **Snippets** - Code templates for common BPMN patterns

## Installation

1. Install from VS Code Marketplace: `BPMNCode Language Support`
2. Install BPMNCode compiler: [Installation Guide](https://github.com/BPMNCode/BPMNCode)
3. Configure executable path in settings

## Configuration

```json
{
  "bpmncode.executablePath": "bpmncode"
}
```

## Usage

Create `.bpmn` files and start writing BPMNCode:

```bpmn
process "Order Processing" {
    start "Order Received"
    user "Review Order"
    xor "Valid Order?"
    
    "Order Received" -> "Review Order"
    "Review Order" -> "Valid Order?"
    ["Valid Order?" == "yes"] -> "Process Order"
    ["Valid Order?" == "no"] -> "Reject Order"
}
```

## Commands

- `BPMNCode: Check File` - Manual validation
- `BPMNCode: Clear Diagnostics` - Clear error markers

## Requirements

- BPMNCode compiler installed and accessible in PATH
- VS Code 1.74.0 or higher

## Known Issues

- Large files may have slower diagnostics
- Import resolution requires saved files

## Contributing

1. Fork the repository
2. Create feature branch
3. Submit pull request

## License

MIT License - see LICENSE file for details