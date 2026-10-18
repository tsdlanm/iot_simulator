// D2 (INPUT) is copied to D12, A0 is printed as a number, D4 (INPUT_PULLUP) is copied to D13.
void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT);
  pinMode(4, INPUT_PULLUP);
  pinMode(12, OUTPUT);
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(12, digitalRead(2));
  digitalWrite(13, digitalRead(4));
  Serial.println(analogRead(A0));
  delay(50);
}
