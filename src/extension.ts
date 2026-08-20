import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "reqly" is now active!');

    const disposable = vscode.commands.registerCommand('reqly.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Reqly!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
