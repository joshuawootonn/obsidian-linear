interface CacheEntry<T> {
	expiresAt: number;
	value: T;
}

export class IssueCache<T> {
	private readonly entries = new Map<string, CacheEntry<T>>();

	constructor(private readonly ttlMs: number) {}

	get(key: string): T | null {
		const entry = this.entries.get(key);
		if (!entry) {
			return null;
		}

		if (Date.now() > entry.expiresAt) {
			this.entries.delete(key);
			return null;
		}

		return entry.value;
	}

	set(key: string, value: T): void {
		this.entries.set(key, {
			value,
			expiresAt: Date.now() + this.ttlMs,
		});
	}

	delete(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}
}
