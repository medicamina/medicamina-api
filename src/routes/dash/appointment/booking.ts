import { HttpError, createApplication } from '@nbit/bun';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { defineRoutes } = createApplication();

export default defineRoutes((app: any) => [
  app.post('/dash/appointment/booking', async (request: any) => {
    const { id, email } = await request.authenticate();
    if (!id || !email) {
      throw new HttpError(401, "Unauthenticated");
    }

    const { longitude, latitude } : { longitude: number, latitude: number } = await request.json();

    function sanitizeInput(input: string) {
      // Escape single quotes by replacing ' with ''
      return input.replace(/'/g, "''");
    }

    async function findNearestClinic(latitude: number, longitude: number) {
      const clinics = await prisma.$queryRaw`
        WITH Distances AS (
          SELECT 
            id,
            latitude,
            longitude,
            approved,
            (
              6371 *
              acos(
                cos(radians(${latitude})) *
                cos(radians(latitude)) *
                cos(radians(longitude) - radians(${longitude})) +
                sin(radians(${latitude})) *
                sin(radians(latitude))
              )
            ) AS distance
          FROM 
            "Clinic"
        )
        SELECT 
          id,
          latitude,
          longitude,
          distance
        FROM 
          Distances
        WHERE 
          distance < 25
        AND
          approved = true
        ORDER BY 
          distance
        LIMIT 20 OFFSET 0;
      `;

      return clinics;
    }

    return findNearestClinic(latitude, longitude)
      .then(async (clinics: any) =>{
        for (var clinic in clinics) {
          clinics[clinic]['clinic'] = await prisma.clinic.findUnique({
            where: {
              id: clinics[clinic].id,
              approved: true
            }, 
            include: {
              hours: true,
              doctors: true
            }
          });
          if (clinics[clinic]['clinic'] == null) {
            clinics.splice(clinic, 1);
          }
        }
        return clinics;
      })
      .catch(error => {
        throw new HttpError(500, error);
      });
  }),
  app.post('/dash/appointment/booking/:clinicId/:doctorId', async (request: any) => {
    const { id, email } = await request.authenticate();
    if (!id || !email) {
      throw new HttpError(401, "Unauthenticated");
    }

    const clinicId = request.params.clinicId;
    const doctorId = request.params.doctorId;

    async function getDoctorAppointments(doctorId: string) {
      const doctor = await prisma.doctor.findUnique({
        where: {
          id: doctorId
        },
        include: {
          hours: true,
          bookings: true
        }
      }).catch((error: string | undefined) => {
        throw new HttpError(500, error);
      });

      return doctor;
    }

    return await getDoctorAppointments(doctorId);
    
  }),
]);