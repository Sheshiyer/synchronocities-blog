from math import pi, cosh

print(f"{'r':>4} {'Euclidean':>12} {'Hyperbolic':>14} {'Ratio':>8}")
print("-" * 42)
for r in range(1, 11):
    euc = pi * r**2
    hyp = 2 * pi * (cosh(r) - 1)
    print(f"{r:>4} {euc:>12.1f} {hyp:>14.1f} {hyp/euc:>8.1f}x")

# r=5:   78.5 vs    286   (3.6x)
# r=10: 314.2 vs 69,004   (219.6x)
