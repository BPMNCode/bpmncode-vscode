import * as vscode from 'vscode';

export class BPMNDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return;

    const word = document.getText(wordRange);
    const text = document.getText();

    const patterns = [
      new RegExp(`\\b(start|end|task|user|service|script|xor|and)\\s+"?${word}"?`, 'gi'),
      new RegExp(`\\b(process|subprocess|pool|lane)\\s+"?${word}"?\\s*\\{`, 'gi'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const pos = document.positionAt(match.index);
        return new vscode.Location(document.uri, pos);
      }
    }

    return undefined;
  }
}
