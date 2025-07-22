export function groupBy<T>(array: T[], getKey: (item: T) => string): Record<string, T[]> {
    return array.reduce((acc, item) => {
        const key = getKey(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, T[]>);
}
