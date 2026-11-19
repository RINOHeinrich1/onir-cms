import type { CreateOtpChallengeInput, OtpChallenge } from "@/domain/entities/otp";

export interface OtpChallengeRepository {
  create(input: CreateOtpChallengeInput): Promise<OtpChallenge>;
  findById(id: string): Promise<OtpChallenge | null>;
  countRecentByEmail(emailHash: string, since: string): Promise<number>;
  countRecentByLink(linkId: string, since: string): Promise<number>;
  countRecentByIp(ip: string, since: string): Promise<number>;
  incrementAttempts(id: string): Promise<number>;
  consume(id: string, codeHash: string): Promise<OtpChallenge | null>;
  purgeExpired(now: string): Promise<number>;
}
