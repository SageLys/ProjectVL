using System;

namespace ProjectVL.Core
{
    public sealed class SystemRandomSource : IRandomSource
    {
        private Random _random;
        public int Seed { get; private set; }

        public SystemRandomSource(int seed)
        {
            Reset(seed);
        }

        public void Reset(int seed)
        {
            Seed = seed;
            _random = new Random(seed);
        }

        public float NextFloat()
        {
            return (float)_random.NextDouble();
        }
    }
}
