// Убрать ANSI / OSC escape-последовательности (терминал / shell stdout)
export function stripAnsi(raw: string): string {
	if (!raw) {
		return '';
	}

	return raw.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
		.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
		.replace(/\u001b[@-Z\\-_]/g, '')
		.replace(/\r/g, '');
}
