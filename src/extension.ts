/* eslint-disable no-console */
import * as vscode from 'vscode';
import * as cp from 'child_process';
import { BPMNDefinitionProvider } from './definition-provider';

interface BPMNDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line: number;
  column: number;
  start: number;
  end: number;
  suggestions: string[];
  code: string;
}

interface BPMNReport {
  file: string;
  errors: BPMNDiagnostic[];
  summary: {
    error_count: number;
    warning_count: number;
    has_errors: boolean;
  };
}

class BPMNDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private executablePath: string = '';

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('bpmncode');
    this.updateExecutablePath();

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('bpmncode.executablePath')) {
        this.updateExecutablePath();
      }
    });
  }

  private updateExecutablePath() {
    const config = vscode.workspace.getConfiguration('bpmncode');

    this.executablePath = config.get('executablePath', 'bpmncode');
  }

  async provideDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'bpmn') {
      return;
    }

    try {
      const diagnostics = await this.runBPMNCodeCheck(document);

      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (error) {
      console.error('BPMNCode check failed:', error);

      if (error instanceof Error && error.message.includes('ENOENT')) {
        vscode.window.showErrorMessage(
          'BPMNCode executable not found. Please check your bpmncode.executablePath setting.',
        );
      }
    }
  }

  private async runBPMNCodeCheck(
    document: vscode.TextDocument,
  ): Promise<vscode.Diagnostic[]> {
    return new Promise((resolve, reject) => {
      const fileName = document.fileName;
      const command = `${this.executablePath} check --format json "${fileName}"`;

      cp.exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        try {
          if (stdout.trim()) {
            const report: BPMNReport = JSON.parse(stdout);
            const diagnostics = this.convertToDiagnostics(report);

            resolve(diagnostics);
          } else if (stderr) {
            console.error('BPMNCode stderr:', stderr);
            reject(new Error(stderr));
          } else {
            resolve([]);
          }
        } catch (parseError) {
          console.error('Failed to parse BPMNCode output:', parseError);
          reject(parseError);
        }
      });
    });
  }

  private convertToDiagnostics(report: BPMNReport): vscode.Diagnostic[] {
    return report.errors.map((error) => {
      const line = Math.max(0, error.line - 1);
      const startColumn = Math.max(0, error.column - 1);

      const length = error.end - error.start;
      const endColumn = startColumn + length;

      const range = new vscode.Range(
        new vscode.Position(line, startColumn),
        new vscode.Position(line, endColumn),
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        this.convertSeverity(error.severity),
      );

      diagnostic.code = error.code;
      diagnostic.source = 'bpmncode';

      return diagnostic;
    });
  }

  private convertSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
        return vscode.DiagnosticSeverity.Information;
      case 'hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Error;
    }
  }

  dispose() {
    this.diagnosticCollection.dispose();
  }
}

class BPMNCodeActionProvider implements vscode.CodeActionProvider {
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'bpmncode') {
        const suggestions = await this.getSuggestions(diagnostic);

        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;
        const startCol = diagnostic.range.start.character;

        let wordStart = startCol;
        let wordEnd = startCol;

        while (wordStart > 0 && /[a-zA-Z_]/.test(lineText[wordStart - 1])) {
          wordStart--;
        }

        while (wordEnd < lineText.length && /[a-zA-Z_]/.test(lineText[wordEnd])) {
          wordEnd++;
        }

        const word = lineText.substring(wordStart, wordEnd);

        for (const suggestion of suggestions) {
          const action = new vscode.CodeAction(
            `Replace '${word}' with '${suggestion}'`,
            vscode.CodeActionKind.QuickFix,
          );

          action.edit = new vscode.WorkspaceEdit();
          action.edit.replace(document.uri, diagnostic.range, suggestion);
          action.diagnostics = [diagnostic];

          actions.push(action);
        }
      }
    }

    return actions;
  }

  private async getSuggestions(diagnostic: vscode.Diagnostic): Promise<string[]> {
    const message = diagnostic.message;
    const didYouMeanMatch = message.match(/did you mean:?\s*['"](.*?)['"]/i);

    if (didYouMeanMatch) {
      return [didYouMeanMatch[1]];
    }

    const multipleMatch = message.match(/did you mean:?\s*(.+)/i);
    if (multipleMatch) {
      return multipleMatch[1]
        .split(/,\s*/)
        .map((s) => s.replace(/['"()?\s]/g, ''))
        .filter((s) => s.length > 0);
    }

    return [];
  }
}

class BPMNCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const snippets = [
      { prefix: 'process', body: 'process ${1:ProcessName} {\n\t$0\n}' },
      { prefix: 'task', body: 'task ${1:TaskName}' },
      { prefix: 'user', body: 'user ${1:UserTask}' },
      { prefix: 'service', body: 'service ${1:ServiceTask}' },
      { prefix: 'start', body: 'start ' },
      { prefix: 'end', body: 'end ' },
      { prefix: 'xor', body: 'xor ${1:Decision} {\n\t$0\n}' },
      { prefix: 'and', body: 'and ${1:Parallel} {\n\t$0\n}' },
      { prefix: 'subprocess', body: 'subprocess ${1:Subprocess} {\n\t$0\n}' },
      { prefix: 'pool', body: 'pool ${1:PoolName} {\n\t$0\n}' },
      { prefix: 'lane', body: 'lane ${1:LaneName} {\n\t$0\n}' },
      { prefix: 'script', body: 'script ${1:ScriptTask}' },
      { prefix: 'call', body: 'call ${1:CallActivity}' },
      { prefix: 'event', body: 'event ${1:EventName}' },
      { prefix: 'group', body: 'group ${1:GroupName} {\n\t$0\n}' },
      { prefix: 'note', body: 'note "${1:annotation}"' },
      { prefix: 'import', body: 'import ' },
      { prefix: 'from', body: 'from ' },
      { prefix: 'as', body: 'as ' },
    ];
    const flowOperators = [
      { op: '->', desc: 'Sequence flow' },
      { op: '-->', desc: 'Message flow' },
      { op: '=>', desc: 'Default flow' },
      { op: '..>', desc: 'Association' },
    ];
    const attributes = [
      'timeout',
      'assignee',
      'priority',
      'endpoint',
      'method',
      'version',
      'author',
      'description',
      'collapsed',
    ];

    snippets.forEach((snippet) => {
      const item = new vscode.CompletionItem(
        snippet.prefix,
        vscode.CompletionItemKind.Snippet,
      );
      item.insertText = new vscode.SnippetString(snippet.body);
      item.filterText = snippet.prefix;
      item.sortText = snippet.prefix;
      items.push(item);
    });

    flowOperators.forEach(({ op, desc }) => {
      const item = new vscode.CompletionItem(op, vscode.CompletionItemKind.Operator);

      item.documentation = new vscode.MarkdownString(desc);

      items.push(item);
    });

    attributes.forEach((attr) => {
      const item = new vscode.CompletionItem(attr, vscode.CompletionItemKind.Property);

      item.insertText = `${attr}=`;

      items.push(item);
    });

    return items;
  }
}

class BPMNHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position);

    if (!range) return null;

    const word = document.getText(range);
    const documentation = this.getDocumentation(word);

    if (documentation) {
      return new vscode.Hover(new vscode.MarkdownString(documentation), range);
    }

    return null;
  }

  private getDocumentation(word: string): string | null {
    const docs: { [key: string]: string } = {
      process: 'Defines a BPMN process container',
      subprocess: 'Embedded processes.',
      start: 'Start event - begins the process flow',
      end: 'End event - terminates the process flow',
      task: 'Generic task activity',
      user: 'User task - requires human interaction',
      service: 'Service task - automated system call',
      script: 'Script task - executes code',
      xor: 'Exclusive gateway - single path selection',
      and: 'Parallel gateway - multiple parallel paths',
      pool: 'Process participant container',
      lane: 'Swimlane within a pool',
      group: 'Visual grouping of elements',
      event: 'Intermediate events',
      call: 'External process invocation',
      note: 'Process documentation',
      '->': 'Sequence flow - normal process flow',
      '-->': 'Message flow - communication between pools',
      '=>': 'Default flow - fallback path from gateway',
      '..>': 'Association - documentation link',
    };

    return docs[word] || null;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('BPMNCode extension is now active');

  const diagnosticsProvider = new BPMNDiagnosticsProvider();
  const codeActionProvider = new BPMNCodeActionProvider();
  const completionProvider = new BPMNCompletionProvider();
  const hoverProvider = new BPMNHoverProvider();
  const definitionProvider = new BPMNDefinitionProvider();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) =>
      diagnosticsProvider.provideDiagnostics(doc),
    ),
    vscode.workspace.onDidSaveTextDocument((doc) =>
      diagnosticsProvider.provideDiagnostics(doc),
    ),
    vscode.workspace.onDidChangeTextDocument((e) =>
      diagnosticsProvider.provideDiagnostics(e.document),
    ),

    vscode.languages.registerCodeActionsProvider('bpmn', codeActionProvider),
    vscode.languages.registerCompletionItemProvider(
      'bpmn',
      completionProvider,
      ' ',
      '\t',
      '\n', // Пробел, таб, новая строка
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
      'p',
      'q',
      'r',
      's',
      't',
      'u',
      'v',
      'w',
      'x',
      'y',
      'z',
    ),
    vscode.languages.registerHoverProvider('bpmn', hoverProvider),
    vscode.languages.registerDefinitionProvider({ language: 'bpmn' }, definitionProvider),

    vscode.commands.registerCommand('bpmn.check', async () => {
      const activeEditor = vscode.window.activeTextEditor;

      if (activeEditor && activeEditor.document.languageId === 'bpmn') {
        await diagnosticsProvider.provideDiagnostics(activeEditor.document);

        vscode.window.showInformationMessage('BPMNCode check completed');
      } else {
        vscode.window.showWarningMessage('No active BPMN file');
      }
    }),

    vscode.commands.registerCommand('bpmn.cleariagnostics', () => {
      diagnosticsProvider.dispose();

      vscode.window.showInformationMessage('BPMNCode diagnostics cleared');
    }),

    diagnosticsProvider,
  );
}

export function deactivate() {
  console.log('BPMNCode extension deactivated');
}
