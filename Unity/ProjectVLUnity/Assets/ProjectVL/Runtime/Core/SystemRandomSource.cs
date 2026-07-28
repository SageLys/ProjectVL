using System;

namespace ProjectVL.Core
{
    public sealed class SystemRandomSource : IRandomSource
    {
        private readonly Random _random;

        public SystemRandomSource(int seed)
        {
            _random = new Random(seed);
        }

        public float NextFloat()
        {
            return (float)_random.NextDouble();
        }
    }
}
