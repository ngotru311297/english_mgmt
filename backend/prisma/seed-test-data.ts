import { prisma } from '../src/lib/prisma.js'
import { hasScheduleConflict } from '../src/utils/schedule.js'

const TEST_MARKER = '[Dữ liệu test QA - có thể xoá]'

const classSeeds = [
  { name: 'QA Demo - Lớp A1', schedule: 'Thứ 2 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A2', schedule: 'Thứ 3 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A3', schedule: 'Thứ 4 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A4', schedule: 'Thứ 5 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A5', schedule: 'Thứ 6 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A6', schedule: 'Thứ 7 18:00-20:00', startTime: '18:00', endTime: '20:00' },
  { name: 'QA Demo - Lớp A7', schedule: 'CN 08:00-10:00', startTime: '08:00', endTime: '10:00' },
  { name: 'QA Demo - Lớp A8', schedule: 'Thứ 2 20:00-21:30', startTime: '20:00', endTime: '21:30' },
  { name: 'QA Demo - Lớp A9', schedule: 'Thứ 3 20:00-21:30', startTime: '20:00', endTime: '21:30' },
  { name: 'QA Demo - Lớp A10', schedule: 'Thứ 4 20:00-21:30', startTime: '20:00', endTime: '21:30' },
]

const teacherSeeds = [
  { name: 'Nguyễn Văn Hùng', nickname: 'Thầy Hùng' },
  { name: 'Trần Thị Lan', nickname: 'Cô Lan' },
  { name: 'Lê Minh Tuấn', nickname: 'Thầy Tuấn' },
  { name: 'Phạm Thị Mai', nickname: 'Cô Mai' },
  { name: 'Hoàng Đức Anh', nickname: 'Thầy Đức' },
  { name: 'Vũ Thị Thu', nickname: 'Cô Thu' },
  { name: 'Đặng Quang Huy', nickname: 'Thầy Huy' },
  { name: 'Bùi Thị Ngọc', nickname: 'Cô Ngọc' },
  { name: 'Ngô Văn Sơn', nickname: 'Thầy Sơn' },
  { name: 'Đỗ Thị Hằng (chưa nhận lớp)', nickname: 'Cô Hằng' },
]

const surnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương']
const middles = ['Văn', 'Thị', 'Hữu', 'Ngọc', 'Minh', 'Thanh', 'Quang', 'Đức', 'Kim', 'Anh']
const firsts = [
  'An', 'Bình', 'Cường', 'Dũng', 'Phúc', 'Giang', 'Hà', 'Huy', 'Khôi', 'Lan',
  'Linh', 'Mai', 'Nam', 'Oanh', 'Phương', 'Quân', 'Sơn', 'Tâm', 'Uyên', 'Vy',
  'Xuân', 'Yến', 'Khang', 'Trang', 'Tú', 'Hiếu', 'Nhi', 'Long', 'Đăng', 'Thảo',
]

function studentNameFor(index: number): string {
  const surname = surnames[index % surnames.length]
  const middle = middles[Math.floor(index / surnames.length) % middles.length]
  const first = firsts[index % firsts.length]
  return `${surname} ${middle} ${first}`
}

// Cố tình trùng tên: 1 cặp trùng trong cùng lớp, 1 cặp trùng khác lớp, 1 bộ ba trùng trong cùng lớp.
const duplicateNameOverrides: Record<number, string> = {
  5: 'Nguyễn Văn An',
  15: 'Nguyễn Văn An',
  22: 'Trần Thị Hoa',
  68: 'Trần Thị Hoa',
  33: 'Lê Minh Khôi',
  43: 'Lê Minh Khôi',
  93: 'Lê Minh Khôi',
}

function phoneFor(seed: number): string {
  return `09${String(10000000 + seed).slice(-8)}`
}

async function main() {
  const alreadySeeded = await prisma.class.findUnique({ where: { name: classSeeds[0].name } })
  if (alreadySeeded) {
    console.log('Dữ liệu test QA có vẻ đã tồn tại (tìm thấy lớp "%s"). Bỏ qua để tránh tạo trùng.', classSeeds[0].name)
    return
  }

  for (let i = 0; i < classSeeds.length; i += 1) {
    const candidate = classSeeds[i]
    const others = classSeeds.filter((_, idx) => idx !== i)
    if (hasScheduleConflict(candidate, others.map((c, idx) => ({ id: idx, ...c })))) {
      throw new Error(`Lịch học của "${candidate.name}" bị trùng với một lớp test khác — kiểm tra lại classSeeds.`)
    }
  }

  const classes = []
  for (const seed of classSeeds) {
    const created = await prisma.class.create({
      data: {
        name: seed.name,
        schedule: seed.schedule,
        startTime: seed.startTime,
        endTime: seed.endTime,
        description: TEST_MARKER,
        status: 'Learning',
      },
    })
    classes.push(created)
  }
  console.log(`Đã tạo ${classes.length} lớp học.`)

  const teachers = []
  for (let i = 0; i < teacherSeeds.length; i += 1) {
    const seed = teacherSeeds[i]
    const created = await prisma.teacher.create({
      data: {
        name: seed.name,
        nickname: seed.nickname,
        phone: phoneFor(100 + i),
        status: 'Active',
      },
    })
    teachers.push(created)
  }
  console.log(`Đã tạo ${teachers.length} giáo viên.`)

  // 9 giáo viên đầu gán 1-1 vào 9 lớp đầu; giáo viên #1 dạy thêm lớp thứ 10;
  // giáo viên cuối cùng (Cô Hằng) cố tình không gán lớp nào để test edge case UI.
  for (let i = 0; i < 9; i += 1) {
    await prisma.teacherClass.create({ data: { teacherId: teachers[i].id, classId: classes[i].id } })
  }
  await prisma.teacherClass.create({ data: { teacherId: teachers[0].id, classId: classes[9].id } })
  console.log(`Giáo viên "${teachers[9].name}" cố tình không gán lớp nào (edge case).`)

  let studentCount = 0
  for (let i = 0; i < 100; i += 1) {
    const targetClass = classes[i % classes.length]
    const name = duplicateNameOverrides[i] ?? studentNameFor(i)
    await prisma.student.create({
      data: {
        name,
        classId: targetClass.id,
        phone: phoneFor(i),
        parentName: `Phụ huynh em ${name}`,
        status: 'Active',
      },
    })
    studentCount += 1
  }
  console.log(`Đã tạo ${studentCount} học viên (10 học viên/lớp, có vài tên trùng để test edge case).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
