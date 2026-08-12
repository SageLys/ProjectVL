using System;

namespace ProjectVL.Core
{
    public struct Float2
    {
        public float X;
        public float Y;

        public Float2(float x, float y)
        {
            X = x;
            Y = y;
        }

        public float Length => (float)Math.Sqrt(X * X + Y * Y);

        public static Float2 operator +(Float2 left, Float2 right)
        {
            return new Float2(left.X + right.X, left.Y + right.Y);
        }

        public static Float2 operator -(Float2 left, Float2 right)
        {
            return new Float2(left.X - right.X, left.Y - right.Y);
        }

        public static Float2 operator *(Float2 value, float scalar)
        {
            return new Float2(value.X * scalar, value.Y * scalar);
        }

        public static float Distance(Float2 left, Float2 right)
        {
            return (left - right).Length;
        }

        public Float2 Normalized()
        {
            float length = Length;
            return length <= 0.000001f ? new Float2() : new Float2(X / length, Y / length);
        }
    }
}
