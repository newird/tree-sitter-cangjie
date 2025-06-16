enum TimeUnit1 {
  Year | Month | Day | Hour
}
enum TimeUnit3 {
  | Year | Month | Day | Hour 
}
enum TimeUnit2 {
| Year(Float32)
| Month(Float32, Float32)
| Day(Float32, Float32, Float32)
| Hour(Float32, Float32, Float32, Float32)
}

public enum Option<T> {
    Some(T) | None
}
